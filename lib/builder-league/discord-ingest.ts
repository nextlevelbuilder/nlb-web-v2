/**
 * Discord ingestion for the Builder League (`POST /api/v1/builder-admin/ingest/discord`).
 *
 * The community bot reports three specific event kinds; message volume never counts. Each accepted
 * event becomes evidence with status `submitted` and source `discord`, waiting for a moderator like any
 * other submission. Nothing here approves, verifies or awards.
 *
 * - The NLB member is resolved through the Discord account linked in onboarding (`community_connections`,
 *   read-only here). The table is unique on (provider, external id), so one Discord account can never
 *   map to two NLB accounts. Unknown Discord users, and members without Builder League access, are
 *   ignored with a reason.
 * - Idempotent: the evidence client key is derived from the message id (`discord:{messageId}`), unique
 *   per member, so bot retries return the stored evidence. The prefix keeps it apart from client keys a
 *   member or an API key chooses.
 * - `help_confirmation` names the helped member (`counterpartDiscordUserId`) as the counterparty. They
 *   still confirm from their own NLB account before a moderator can approve.
 */
import { createHash, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AppDb } from "@/lib/db";
import { activityEvidence, communityConnections, users } from "@/lib/db/schema";
import { HttpUrlSchema } from "@nextlevelbuilder/contracts";
import { getViewerAccess } from "./access";
import { EARLIEST_OCCURRED_AT, type Evidence } from "./evidence";
import { getEffectiveRuleset } from "./ruleset";
import type { EventTypeKey } from "./types";

export const DISCORD_INGEST_KINDS = ["ship_post", "help_confirmation", "weekly_active"] as const;
export type DiscordIngestKind = (typeof DISCORD_INGEST_KINDS)[number];

/** The ruleset event each Discord kind is evidence for. */
export const DISCORD_KIND_EVENT: Record<DiscordIngestKind, EventTypeKey> = {
  ship_post: "ship_public_post",
  help_confirmation: "contribute_peer_help",
  weekly_active: "contribute_discord_active",
};

const KIND_TITLE: Record<DiscordIngestKind, string> = {
  ship_post: "SHIP post on Discord",
  help_confirmation: "Help confirmed on Discord",
  weekly_active: "Active on Discord this week",
};

export const INGEST_SECRET_HEADER = "x-nlb-builder-ingest-secret";
const MIN_SECRET_LENGTH = 32;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Discord snowflake ids are 17–20 digit integers; allow a little headroom. */
const Snowflake = z.string().regex(/^\d{15,22}$/, "Must be a Discord id (snowflake).");

export const DiscordIngestSchema = z
  .object({
    kind: z.enum(DISCORD_INGEST_KINDS),
    discordUserId: Snowflake,
    messageId: Snowflake,
    channelId: Snowflake,
    url: HttpUrlSchema.max(2048).optional(),
    occurredAt: z.union([z.string().max(40), z.number()]),
    counterpartDiscordUserId: Snowflake.optional(),
    summary: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const at = typeof value.occurredAt === "number" ? value.occurredAt : Date.parse(value.occurredAt);
    if (!Number.isFinite(at)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["occurredAt"], message: "occurredAt must be an ISO timestamp or epoch ms." });
    else if (at > Date.now() + FUTURE_SKEW_MS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["occurredAt"], message: "occurredAt cannot be in the future." });
    else if (at < EARLIEST_OCCURRED_AT) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["occurredAt"], message: "occurredAt is before the first Builder League ruleset." });
  });
export type DiscordIngestInput = z.input<typeof DiscordIngestSchema>;

export type DiscordIgnoreReason =
  | "unknown_discord_user"
  | "no_builder_access"
  | "counterpart_required"
  | "unknown_counterpart"
  | "self_counterpart"
  | "event_type_not_in_ruleset";

export type DiscordIngestResult =
  | { status: "created" | "existing"; evidence: Evidence }
  | { status: "ignored"; reason: DiscordIgnoreReason };

/** NLB user linked to a Discord account, or null. Read-only on `community_connections`. */
export async function findUserIdByDiscordId(db: AppDb, discordUserId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: communityConnections.userId })
    .from(communityConnections)
    .where(and(eq(communityConnections.provider, "discord"), eq(communityConnections.externalUserId, discordUserId)))
    .limit(1);
  return row?.userId ?? null;
}

function readSecret(): string | undefined {
  try {
    const value = (getCloudflareContext().env as unknown as Record<string, string | undefined>).BUILDER_INGEST_SECRET;
    if (value) return value;
  } catch {
    // Outside the Worker runtime.
  }
  return process.env.BUILDER_INGEST_SECRET;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * True when the request carries the shared ingest secret. A configured secret shorter than 32
 * characters is treated as unset, so a weak value never authenticates.
 */
export function hasValidIngestSecret(headers: Headers, secret: string | undefined = readSecret()): boolean {
  const provided = headers.get(INGEST_SECRET_HEADER);
  if (!provided || !secret || secret.length < MIN_SECRET_LENGTH) return false;
  return timingSafeEqual(digest(provided), digest(secret));
}

export const discordClientKey = (messageId: string) => `discord:${messageId}`;

function discordMessageUrl(channelId: string, messageId: string): string | null {
  let guildId: string | undefined;
  try {
    guildId = (getCloudflareContext().env as unknown as Record<string, string | undefined>).DISCORD_GUILD_ID;
  } catch {
    guildId = process.env.DISCORD_GUILD_ID;
  }
  return guildId && /^\d{15,22}$/.test(guildId) ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}` : null;
}

async function findByClientKey(db: AppDb, userId: string, clientKey: string): Promise<Evidence | null> {
  const [row] = await db
    .select()
    .from(activityEvidence)
    .where(and(eq(activityEvidence.userId, userId), eq(activityEvidence.clientKey, clientKey)))
    .limit(1);
  return row ?? null;
}

/** Turns one bot event into submitted evidence, or explains why it was ignored. */
export async function ingestDiscordEvent(db: AppDb, input: unknown): Promise<DiscordIngestResult> {
  const parsed = DiscordIngestSchema.parse(input);
  const userId = await findUserIdByDiscordId(db, parsed.discordUserId);
  if (!userId) return { status: "ignored", reason: "unknown_discord_user" };

  const clientKey = discordClientKey(parsed.messageId);
  const replay = await findByClientKey(db, userId, clientKey);
  if (replay) return { status: "existing", evidence: replay };

  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await getViewerAccess(db, user)).canUse) return { status: "ignored", reason: "no_builder_access" };

  let counterpartyUserId: string | null = null;
  if (parsed.kind === "help_confirmation") {
    if (!parsed.counterpartDiscordUserId) return { status: "ignored", reason: "counterpart_required" };
    counterpartyUserId = await findUserIdByDiscordId(db, parsed.counterpartDiscordUserId);
    if (!counterpartyUserId) return { status: "ignored", reason: "unknown_counterpart" };
    if (counterpartyUserId === userId) return { status: "ignored", reason: "self_counterpart" };
  }

  const occurredAt = new Date(typeof parsed.occurredAt === "number" ? parsed.occurredAt : Date.parse(parsed.occurredAt));
  const definition = getEffectiveRuleset(occurredAt).events[DISCORD_KIND_EVENT[parsed.kind]];
  if (!definition) return { status: "ignored", reason: "event_type_not_in_ruleset" };

  const link = parsed.url ?? discordMessageUrl(parsed.channelId, parsed.messageId);
  const now = new Date();
  const inserted = await db
    .insert(activityEvidence)
    .values({
      id: crypto.randomUUID(),
      userId,
      // The member attaches the project (SHIP evidence needs one) while the evidence is still submitted.
      projectId: null,
      eventType: definition.key,
      stage: definition.stage,
      title: KIND_TITLE[parsed.kind],
      summary: parsed.summary ?? "",
      occurredAt,
      links: link ? [link] : [],
      privateObjectKeys: [],
      counterpartyUserId,
      counterpartyConfirmedAt: null,
      status: "submitted",
      source: "discord",
      visibility: "private",
      clientKey,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [activityEvidence.userId, activityEvidence.clientKey] })
    .returning();
  if (inserted[0]) return { status: "created", evidence: inserted[0] };
  // A concurrent retry stored it first.
  const existing = await findByClientKey(db, userId, clientKey);
  if (!existing) throw new Error("discord ingest: evidence conflict without a stored row");
  return { status: "existing", evidence: existing };
}
