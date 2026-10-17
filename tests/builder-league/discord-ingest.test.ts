import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-api-key", () => ({
  resolveCaller: async (headers: Headers) => {
    const id = headers.get("x-test-user");
    if (!id) return null;
    const role = id === "admin" || id === "mod2" ? "admin" : "user";
    return { user: { id, name: id, email: `${id}@example.com`, role, emailVerified: true }, authType: headers.get("x-test-auth") ?? "session" };
  },
}));
vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: undefined, vip: undefined },
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      BUILDER_EVIDENCE: (globalThis as { __BUILDER_EVIDENCE__?: unknown }).__BUILDER_EVIDENCE__,
      BUILDER_LEAGUE_ENABLED: process.env.BUILDER_LEAGUE_ENABLED,
      BUILDER_INGEST_SECRET: process.env.BUILDER_INGEST_SECRET,
      DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    },
  }),
}));

import { eq } from "drizzle-orm";
import { runWithDb } from "@/lib/db";
import { activityEvidence, builderEvents, communityConnections, scoreLedger } from "@/lib/db/schema";
import { INGEST_SECRET_HEADER, hasValidIngestSecret, ingestDiscordEvent, type DiscordIngestInput } from "@/lib/builder-league/discord-ingest";
import { POST as ingestRoute } from "@/app/api/v1/builder-admin/ingest/discord/route";
import { TEST_NOW, createLeagueEnv, jsonRequest, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;
const SECRET = "s".repeat(48);
const GUILD = "100000000000000001";
const DISCORD = { alice: "200000000000000001", bob: "200000000000000002", outsider: "200000000000000003", stranger: "200000000000000099" };

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: TEST_NOW });
  env = await createLeagueEnv();
});
afterAll(async () => {
  await env.dispose();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.setSystemTime(TEST_NOW);
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
  vi.stubEnv("BUILDER_INGEST_SECRET", SECRET);
  vi.stubEnv("DISCORD_GUILD_ID", GUILD);
  await env.reset();
  await seedMembers(env.db);
  await env.db.insert(communityConnections).values([
    { userId: "alice", provider: "discord", externalUserId: DISCORD.alice },
    { userId: "bob", provider: "discord", externalUserId: DISCORD.bob },
    { userId: "outsider", provider: "discord", externalUserId: DISCORD.outsider },
  ]);
});

const event = (overrides: Partial<DiscordIngestInput> = {}): DiscordIngestInput => ({
  kind: "ship_post",
  discordUserId: DISCORD.alice,
  messageId: "300000000000000001",
  channelId: "400000000000000001",
  occurredAt: new Date(TEST_NOW.getTime() - 3_600_000).toISOString(),
  summary: "Shipped the onboarding flow.",
  ...overrides,
});

function ingestRequest(body: unknown, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/v1/builder-admin/ingest/discord", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);

describe("discord ingest", () => {
  it("stores submitted, private evidence and replays a retried message idempotently", async () => {
    const first = await ingestDiscordEvent(env.db, event());
    expect(first).toMatchObject({
      status: "created",
      evidence: {
        userId: "alice",
        eventType: "ship_public_post",
        status: "submitted",
        source: "discord",
        visibility: "private",
        clientKey: "discord:300000000000000001",
        links: [`https://discord.com/channels/${GUILD}/400000000000000001/300000000000000001`],
      },
    });
    const retry = await ingestDiscordEvent(env.db, event({ summary: "Retried by the bot." }));
    expect(retry.status).toBe("existing");
    if (first.status === "ignored" || retry.status === "ignored") throw new Error("unreachable");
    expect(retry.evidence.id).toBe(first.evidence.id);
    expect(await env.db.select().from(activityEvidence)).toHaveLength(1);
  });

  it("never approves, records events or awards RP", async () => {
    await ingestDiscordEvent(env.db, event({ kind: "weekly_active" }));
    const [stored] = await env.db.select().from(activityEvidence);
    expect(stored).toMatchObject({ eventType: "contribute_discord_active", status: "submitted", eventId: null, decidedBy: null });
    expect(await env.db.select().from(builderEvents)).toEqual([]);
    expect(await env.db.select().from(scoreLedger)).toEqual([]);
  });

  it("ignores unknown Discord users and members without league access", async () => {
    expect(await ingestDiscordEvent(env.db, event({ discordUserId: DISCORD.stranger }))).toEqual({ status: "ignored", reason: "unknown_discord_user" });
    expect(await ingestDiscordEvent(env.db, event({ discordUserId: DISCORD.outsider }))).toEqual({ status: "ignored", reason: "no_builder_access" });
    expect(await env.db.select().from(activityEvidence)).toEqual([]);
  });

  it("cannot map one Discord account to two NLB accounts", async () => {
    // The (provider, external id) unique constraint is what makes the member lookup unambiguous.
    await expect(env.db.insert(communityConnections).values({ userId: "carol", provider: "discord", externalUserId: DISCORD.alice })).rejects.toThrow();
    const rows = await env.db.select().from(communityConnections).where(eq(communityConnections.externalUserId, DISCORD.alice));
    expect(rows.map((row) => row.userId)).toEqual(["alice"]);
  });

  it("names the helped member as counterparty without confirming for them", async () => {
    const result = await ingestDiscordEvent(env.db, event({ kind: "help_confirmation", counterpartDiscordUserId: DISCORD.bob }));
    expect(result).toMatchObject({
      status: "created",
      evidence: { eventType: "contribute_peer_help", counterpartyUserId: "bob", counterpartyConfirmedAt: null, status: "submitted" },
    });
    expect(await ingestDiscordEvent(env.db, event({ kind: "help_confirmation", messageId: "300000000000000002" }))).toEqual({
      status: "ignored",
      reason: "counterpart_required",
    });
    expect(
      await ingestDiscordEvent(env.db, event({ kind: "help_confirmation", messageId: "300000000000000003", counterpartDiscordUserId: DISCORD.stranger }))
    ).toEqual({ status: "ignored", reason: "unknown_counterpart" });
    expect(
      await ingestDiscordEvent(env.db, event({ kind: "help_confirmation", messageId: "300000000000000004", counterpartDiscordUserId: DISCORD.alice }))
    ).toEqual({ status: "ignored", reason: "self_counterpart" });
  });

  it("rejects malformed payloads", async () => {
    await expect(ingestDiscordEvent(env.db, event({ discordUserId: "alice" }))).rejects.toMatchObject({ name: "ZodError" });
    await expect(ingestDiscordEvent(env.db, { ...event(), extra: true })).rejects.toMatchObject({ name: "ZodError" });
    await expect(ingestDiscordEvent(env.db, event({ occurredAt: new Date(TEST_NOW.getTime() + 3_600_000).toISOString() }))).rejects.toMatchObject({
      name: "ZodError",
    });
  });
});

describe("ingest secret", () => {
  it("accepts only the configured secret, and never a short one", () => {
    expect(hasValidIngestSecret(new Headers({ [INGEST_SECRET_HEADER]: SECRET }))).toBe(true);
    expect(hasValidIngestSecret(new Headers({ [INGEST_SECRET_HEADER]: `${SECRET}x` }))).toBe(false);
    expect(hasValidIngestSecret(new Headers())).toBe(false);
    expect(hasValidIngestSecret(new Headers({ [INGEST_SECRET_HEADER]: "short" }), "short")).toBe(false);
  });
});

describe("POST /api/v1/builder-admin/ingest/discord", () => {
  it("authenticates with the shared secret and reports created, replayed and ignored events", async () => {
    const created = await call(() => ingestRoute(ingestRequest(event(), { [INGEST_SECRET_HEADER]: SECRET })));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ data: { status: "created", evidence: { eventType: "ship_public_post", status: "submitted" } } });

    const replay = await call(() => ingestRoute(ingestRequest(event(), { [INGEST_SECRET_HEADER]: SECRET })));
    expect(replay.status).toBe(200);

    const ignored = await call(() => ingestRoute(ingestRequest(event({ discordUserId: DISCORD.stranger }), { [INGEST_SECRET_HEADER]: SECRET })));
    expect(ignored.status).toBe(202);
    expect(await ignored.json()).toMatchObject({ data: { status: "ignored", reason: "unknown_discord_user" } });
  });

  it("rejects a wrong secret, anonymous callers and non-admins", async () => {
    expect((await call(() => ingestRoute(ingestRequest(event(), { [INGEST_SECRET_HEADER]: "x".repeat(48) })))).status).toBe(401);
    expect((await call(() => ingestRoute(jsonRequest("/api/v1/builder-admin/ingest/discord", null, event())))).status).toBe(401);
    expect((await call(() => ingestRoute(jsonRequest("/api/v1/builder-admin/ingest/discord", "alice", event())))).status).toBe(403);
    expect(await env.db.select().from(activityEvidence)).toEqual([]);
  });

  it("lets an admin replay an event and validates the body", async () => {
    const response = await call(() => ingestRoute(jsonRequest("/api/v1/builder-admin/ingest/discord", "admin", event())));
    expect(response.status).toBe(201);
    const invalid = await call(() => ingestRoute(jsonRequest("/api/v1/builder-admin/ingest/discord", "admin", { kind: "chatter" })));
    expect(invalid.status).toBe(400);
  });
});
