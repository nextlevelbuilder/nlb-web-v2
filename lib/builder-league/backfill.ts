/**
 * Opt-in backfill of Builder League history from records already in D1.
 *
 * Only members who switched on `builder_privacy.backfill_opt_in` are touched. For each published
 * directory product whose organization the member owns, one SHIP `ship_product_launch` event is
 * recorded, dated at the product's original approval (the earliest approved submission's review time,
 * falling back to the product's creation time), with source `backfill`, verification `system_verified`
 * and provenance `{ source: "legacy-d1-import", importedAt, originalTable, originalId }`. The event is
 * scored by the ruleset in force at that original date, so pre-v2 launches use v1.
 *
 * Nothing is synthesised: no record, no event. Re-running is a no-op (event and ledger dedupe keys), and
 * dry-run mode reports what would happen without writing anything.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { builderEvents, builderPrivacy, members, products } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { awardForEventDetailed, builderDedupeKey, recordBuilderEvent } from "./ledger";
import { recordModerationAction } from "./audit";
import { getPrivacy } from "./privacy";
import { findOrCreateProductProject } from "./projects";
import { getEffectiveRuleset } from "./ruleset";
import type { ActorRole, EventTypeKey } from "./types";

export const BACKFILL_PROVENANCE_SOURCE = "legacy-d1-import";
const LAUNCH_EVENT: EventTypeKey = "ship_product_launch";
const MAX_USERS_PER_RUN = 500;

export const BackfillInputSchema = z
  .object({
    /** Defaults to every member who opted in. */
    userIds: z.array(z.string().trim().min(1).max(128)).min(1).max(MAX_USERS_PER_RUN).optional(),
    /** Defaults to true: a run only writes when `dryRun: false` is sent explicitly. */
    dryRun: z.boolean().default(true),
  })
  .strict();

export type BackfillAction = "created" | "existing" | "planned" | "skipped";

export interface BackfillItem {
  productId: string;
  productSlug: string;
  title: string;
  occurredAt: string;
  originalTable: "submissions" | "products";
  originalId: string;
  rulesetVersion: string;
  rp: number;
  action: BackfillAction;
  reason: string | null;
  eventId: string | null;
  entryId: string | null;
}

export interface BackfillUserReport {
  userId: string;
  optedIn: boolean;
  items: BackfillItem[];
}

export interface BackfillReport {
  dryRun: boolean;
  importedAt: string;
  users: BackfillUserReport[];
  totals: Record<BackfillAction, number>;
}

interface LaunchRecord {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  createdAt: Date;
  approvedAt: number | null;
  approvalSubmissionId: string | null;
}

/** Published products of organizations the user owns, with their original approval time. */
export async function findLaunchRecords(db: AppDb, userId: string): Promise<LaunchRecord[]> {
  const rows = await db
    .selectDistinct({
      id: products.id,
      slug: products.slug,
      title: products.title,
      tagline: products.tagline,
      createdAt: products.createdAt,
      approvedAt: sql<number | null>`(select min(s.reviewed_at) from submissions s where s.product_id = ${products.id} and s.status = 'approved' and s.reviewed_at is not null)`,
      approvalSubmissionId: sql<string | null>`(select s.id from submissions s where s.product_id = ${products.id} and s.status = 'approved' and s.reviewed_at is not null order by s.reviewed_at asc, s.id asc limit 1)`,
    })
    .from(products)
    .innerJoin(members, eq(members.organizationId, products.orgId))
    .where(and(eq(members.userId, userId), eq(members.role, "owner"), eq(products.status, "published")));
  return rows.map((row) => ({ ...row, approvedAt: row.approvedAt === null ? null : Number(row.approvedAt) }));
}

export async function optedInUserIds(db: AppDb): Promise<string[]> {
  const rows = await db.select({ userId: builderPrivacy.userId }).from(builderPrivacy).where(eq(builderPrivacy.backfillOptIn, true)).limit(MAX_USERS_PER_RUN);
  return rows.map((row) => row.userId);
}

async function eventExists(db: AppDb, userId: string, productId: string): Promise<string | null> {
  const dedupeKey = builderDedupeKey("backfill", `product:${productId}`, userId, LAUNCH_EVENT);
  const [row] = await db.select({ id: builderEvents.id }).from(builderEvents).where(eq(builderEvents.dedupeKey, dedupeKey)).limit(1);
  return row?.id ?? null;
}

export interface BackfillContext {
  dryRun: boolean;
  importedAt: Date;
  actorId: string;
  actorRole: ActorRole;
}

export async function backfillUser(db: AppDb, userId: string, context: BackfillContext): Promise<BackfillUserReport> {
  const privacy = await getPrivacy(db, userId);
  if (!privacy.backfillOptIn) return { userId, optedIn: false, items: [] };

  const items: BackfillItem[] = [];
  for (const record of await findLaunchRecords(db, userId)) {
    const occurredAt = new Date(record.approvedAt ?? record.createdAt.getTime());
    const originalTable = record.approvedAt !== null && record.approvalSubmissionId ? "submissions" : "products";
    const originalId = originalTable === "submissions" ? record.approvalSubmissionId! : record.id;
    const ruleset = getEffectiveRuleset(occurredAt);
    const definition = ruleset.events[LAUNCH_EVENT];
    const base = {
      productId: record.id,
      productSlug: record.slug,
      title: record.title,
      occurredAt: occurredAt.toISOString(),
      originalTable,
      originalId,
      rulesetVersion: ruleset.version,
      rp: definition?.rp ?? 0,
    } satisfies Partial<BackfillItem>;

    if (!definition) {
      items.push({ ...base, action: "skipped", reason: "event_type_not_in_ruleset", eventId: null, entryId: null });
      continue;
    }
    if (occurredAt.getTime() > context.importedAt.getTime()) {
      items.push({ ...base, action: "skipped", reason: "occurred_in_future", eventId: null, entryId: null });
      continue;
    }
    if (context.dryRun) {
      const existing = await eventExists(db, userId, record.id);
      items.push({ ...base, action: existing ? "existing" : "planned", reason: null, eventId: existing, entryId: null });
      continue;
    }

    const project = await findOrCreateProductProject(db, userId, record);
    const { event, created } = await recordBuilderEvent(db, {
      kind: "backfill",
      subjectUserId: userId,
      actorUserId: context.actorId,
      actorRole: "system",
      projectId: project.id,
      eventType: LAUNCH_EVENT,
      source: "backfill",
      externalEventId: `product:${record.id}`,
      occurredAt,
      rulesetVersion: ruleset.version,
      verification: "system_verified",
      visibility: "private",
      payload: { productSlug: record.slug, title: record.title },
      provenance: {
        source: BACKFILL_PROVENANCE_SOURCE,
        importedAt: context.importedAt.toISOString(),
        originalTable,
        originalId,
        productId: record.id,
      },
    });
    const award = await awardForEventDetailed(db, event.id, { actorId: context.actorId, actorRole: "system" });
    items.push({
      ...base,
      action: created || award.created ? "created" : award.entry ? "existing" : "skipped",
      reason: award.reason,
      eventId: event.id,
      entryId: award.entry?.id ?? null,
    });
  }

  const createdCount = items.filter((item) => item.action === "created").length;
  if (!context.dryRun && createdCount > 0) {
    await recordModerationAction(db, {
      targetType: "backfill",
      targetId: userId,
      action: "backfill",
      actorId: context.actorId,
      actorRole: context.actorRole,
      reasonCodes: [BACKFILL_PROVENANCE_SOURCE],
      notes: `${createdCount} launch event(s) imported`,
    });
  }
  return { userId, optedIn: true, items };
}

/** Runs the backfill for the given users (default: everyone opted in). */
export async function runBackfill(
  db: AppDb,
  input: unknown,
  actor: { actorId: string; actorRole: ActorRole },
  importedAt: Date = new Date()
): Promise<BackfillReport> {
  if (actor.actorRole !== "admin" && actor.actorRole !== "system") {
    throw new BuilderApiError(403, "backfill_not_allowed", "Only admins and the system can run the backfill.");
  }
  const parsed = BackfillInputSchema.parse(input);
  const userIds = [...new Set(parsed.userIds ?? (await optedInUserIds(db)))];
  const context: BackfillContext = { dryRun: parsed.dryRun, importedAt, actorId: actor.actorId, actorRole: actor.actorRole };
  const users: BackfillUserReport[] = [];
  for (const userId of userIds) users.push(await backfillUser(db, userId, context));
  const totals: Record<BackfillAction, number> = { created: 0, existing: 0, planned: 0, skipped: 0 };
  for (const report of users) for (const item of report.items) totals[item.action] += 1;
  return { dryRun: parsed.dryRun, importedAt: importedAt.toISOString(), users, totals };
}
