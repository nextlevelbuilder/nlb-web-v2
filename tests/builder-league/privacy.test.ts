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
    },
  }),
}));

import { eq, sql, type InferInsertModel } from "drizzle-orm";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { runWithDb } from "@/lib/db";
import {
  activityEvidence,
  badgeAwards,
  builderEvents,
  builderModerationActions,
  builderPilotMembers,
  builderPrivacy,
  builderProjects,
  builderShareLinks,
  evidenceAppeals,
  leagueSnapshots,
  mentorNominations,
  rankAwards,
  renderJobs,
  rewardClaims,
  rewardItems,
  scoreCapSlots,
  scoreLedger,
  seasonEnrollments,
  shareAttributions,
  timeCapsuleEntries,
  users,
  yearlySnapshots,
} from "@/lib/db/schema";
import { BuilderApiError } from "@/lib/builder-league/http";
import { deleteBuilderData, exportBuilderData, type PrivacyBucket } from "@/lib/builder-league/privacy-requests";
import { privacyPaths, privacySchemas } from "@/lib/builder-league/openapi/privacy";
import { GET as exportRoute } from "@/app/api/v1/builder-admin/privacy/[userId]/export/route";
import { POST as deleteRoute } from "@/app/api/v1/builder-admin/privacy/[userId]/delete/route";
import { TEST_NOW, createLeagueEnv, jsonRequest, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;

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
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
  await env.reset();
  await seedMembers(env.db);
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);
const params = (userId: string) => ({ params: Promise.resolve({ userId }) });
const day = (n: number) => new Date(TEST_NOW.getTime() - n * 86_400_000);
const bucket = () => env.bucket as unknown as PrivacyBucket & { get(key: string): Promise<unknown>; put(key: string, value: Uint8Array): Promise<unknown> };

const ALICE_KEYS = ["evidence/alice/ev-a/proof.png", "evidence/alice/orphan/left-behind.png", "renders/alice/2026/job-a.mp4", "renders/alice/2026/job-a.png"];
const BOB_KEY = "evidence/bob/ev-b/proof.png";

const event = (id: string, subject: string, extra: Partial<InferInsertModel<typeof builderEvents>> = {}) => ({
  id,
  eventId: `evt-${id}`,
  kind: "activity" as const,
  subjectUserId: subject,
  actorRole: "member" as const,
  stage: "ship" as const,
  eventType: "ship_public_post",
  source: "member" as const,
  externalEventId: id,
  dedupeKey: `dedupe-${id}`,
  occurredAt: day(30),
  receivedAt: day(29),
  rulesetVersion: "v2",
  verification: "moderator_verified" as const,
  ...extra,
});

/** Alice has data in every league table; Bob's rows mention her as counterparty, helper or awarder. */
async function seedAlice() {
  const db = env.db;
  const rows = <T extends AnySQLiteTable>(table: T, values: InferInsertModel<T>[]) => values.map((value) => db.insert(table).values(value as never));
  for (const key of [...ALICE_KEYS, BOB_KEY]) await bucket().put(key, new Uint8Array([1, 2, 3]));
  await db.batch([
    db.insert(builderPrivacy).values({ userId: "alice", leaderboardPublic: true }),
    ...rows(activityEvidence, [
      { id: "ev-a", userId: "alice", projectId: "p-alice", eventType: "ship_public_post", stage: "ship", title: "Launch", occurredAt: day(30), source: "member", clientKey: "a", privateObjectKeys: [ALICE_KEYS[0]], status: "approved", decidedBy: "admin" },
      { id: "ev-b", userId: "bob", projectId: "p-bob", eventType: "contribute_peer_help", stage: "contribute", title: "Helped", occurredAt: day(20), source: "member", clientKey: "b", privateObjectKeys: [BOB_KEY], counterpartyUserId: "alice", counterpartyConfirmedAt: day(19), decidedBy: "alice" },
    ]),
    db.insert(evidenceAppeals).values({ id: "ap-a", evidenceId: "ev-a", userId: "alice", reason: "Please" }),
    ...rows(builderEvents, [
      event("e-a", "alice", { actorUserId: "mod-x" }),
      event("e-b", "bob", { stage: "contribute", eventType: "contribute_peer_help", actorUserId: "alice", payload: { counterpartyUserId: "alice", title: "Helped" } }),
    ]),
    ...rows(scoreLedger, [
      { id: "l-a", userId: "alice", eventId: "evt-e-a", awardType: "activity", stage: "ship", rp: 30, rulesetVersion: "v2", dedupeKey: "l-a", reason: "awarded_by:admin:mod-x", occurredAt: day(30) },
      { id: "l-b", userId: "bob", eventId: "evt-e-b", awardType: "manual", stage: "contribute", rp: 5, rulesetVersion: "v2", dedupeKey: "l-b", reason: "awarded_by:member:alice", occurredAt: day(20) },
    ]),
    db.insert(scoreCapSlots).values({ slotKey: "alice|ship_public_post|p-alice|2026-W40|0", userId: "alice", entryId: "l-a" }),
    db.insert(scoreCapSlots).values({ slotKey: "bob|contribute_peer_help|alice|2026-W41|0", userId: "bob", entryId: "l-b" }),
    db.insert(yearlySnapshots).values({
      id: "ys-b",
      userId: "bob",
      year: 2026,
      rulesetVersion: "v2",
      data: { year: 2026, peerMentions: [{ userId: "alice", name: "Alice" }, { userId: "carol", name: "Carol" }] },
    }),
    ...rows(builderModerationActions, [
      { id: "m-1", targetType: "pilot_member", targetId: "alice", action: "add", actorId: "admin", actorRole: "admin", createdAt: day(40) },
      { id: "m-2", targetType: "evidence", targetId: "ev-a", action: "approve", actorId: "admin", actorRole: "admin", reasonCodes: ["clear_outcome"], createdAt: day(29) },
    ]),
    db.insert(leagueSnapshots).values({
      id: "snap-1",
      board: "overall",
      periodType: "month",
      periodKey: "2026-10",
      status: "final",
      rulesetVersion: "v2",
      watermarkAt: day(10),
      eventHash: "hash-unchanged",
      entries: [
        { userId: "alice", rp: 30, rank: 1 },
        { userId: "bob", rp: 5, rank: 2 },
      ],
    }),
    db.insert(rankAwards).values({ id: "rank-a", userId: "alice", rank: "builder", rulesetVersion: "v2" }),
    db.insert(rankAwards).values({ id: "rank-b", userId: "bob", rank: "builder", rulesetVersion: "v2", awardedBy: "alice" }),
    db.insert(mentorNominations).values({ id: "nom-1", nomineeUserId: "bob", mentorUserId: "alice", rank: "architect", year: 2026 }),
    db.insert(badgeAwards).values({ id: "badge-a", userId: "alice", badgeKey: "first_ship" }),
    db.insert(seasonEnrollments).values({ userId: "alice", seasonKey: "2026-s2", track: "ship" }),
    ...rows(rewardItems, [
      { id: "r-1", key: "limited", kind: "perk", title: { en: "Perk", vi: "Perk" }, description: { en: "x", vi: "x" }, inventory: 2, active: true },
      { id: "r-2", key: "open", kind: "perk", title: { en: "Open", vi: "Open" }, description: { en: "x", vi: "x" }, inventory: null, active: true },
    ]),
    ...rows(rewardClaims, [
      { id: "rc-1", rewardId: "r-1", userId: "alice", periodKey: "2026-11", status: "requested" },
      { id: "rc-2", rewardId: "r-1", userId: "alice", periodKey: "2026-10", status: "redeemed" },
      { id: "rc-3", rewardId: "r-2", userId: "alice", periodKey: "2026-11", status: "approved" },
      { id: "rc-4", rewardId: "r-1", userId: "bob", periodKey: "2026-11", status: "approved", decidedBy: "alice" },
    ]),
    db.insert(timeCapsuleEntries).values({ id: "tc-a", userId: "alice", year: 2026, kind: "intent", body: "Ship it" }),
    db.insert(yearlySnapshots).values({ id: "ys-a", userId: "alice", year: 2026, rulesetVersion: "v2", data: { private: true }, hiddenScenes: ["mvp"] }),
    db.insert(renderJobs).values({ id: "job-a", userId: "alice", year: 2026, snapshotId: "ys-a", format: "9x16", dedupeKey: "job-a", status: "done", outputKey: ALICE_KEYS[2] }),
    ...rows(builderShareLinks, [
      { id: "sl-a", tokenHash: "secret-token-hash", userId: "alice", kind: "year_review", year: 2026 },
      { id: "sl-b", tokenHash: "bob-hash", userId: "bob", kind: "passport" },
    ]),
    ...rows(shareAttributions, [
      { id: "sa-1", shareLinkId: "sl-a", kind: "visit" },
      { id: "sa-2", shareLinkId: "sl-a", kind: "signup", userId: "outsider" },
      { id: "sa-3", shareLinkId: "sl-b", kind: "signup", userId: "alice" },
    ]),
  ]);
}

/** Every text cell of the league tables that still equals or mentions the given id. */
async function mentions(id: string): Promise<string[]> {
  const tables = [
    "activity_evidence", "builder_events", "score_ledger", "score_cap_slots", "builder_moderation_actions", "evidence_appeals",
    "league_snapshots", "rank_awards", "mentor_nominations", "badge_awards", "season_enrollments", "reward_claims",
    "time_capsule_entries", "yearly_snapshots", "builder_share_links", "share_attributions", "render_jobs",
    "builder_privacy", "builder_pilot_members", "builder_projects",
  ];
  const found: string[] = [];
  for (const table of tables) {
    const rows = await env.db.all<Record<string, unknown>>(sql.raw(`select * from "${table}"`));
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value !== "string") continue;
        const embedded = value.includes(`"${id}"`) || value.endsWith(`:${id}`) || `|${value}|`.includes(`|${id}|`);
        if (value === id || embedded) found.push(`${table}.${column}`);
      }
    }
  }
  return found;
}

describe("exportBuilderData", () => {
  it("returns the member's league data without tokens or moderator ids", async () => {
    await seedAlice();
    const data = await exportBuilderData(env.db, "alice", TEST_NOW);
    expect(data).toMatchObject({ schema: 1, userId: "alice", exportedAt: TEST_NOW.toISOString(), shareFunnel: { visits: 1, signups: 1, paid: 0 } });
    expect(data.privacy).toMatchObject({ userId: "alice", leaderboardPublic: true });
    expect(data.pilot).toMatchObject({ note: null });
    expect(data.evidence).toHaveLength(1);
    expect(data.confirmationsGiven).toEqual([expect.objectContaining({ evidenceId: "ev-b", eventType: "contribute_peer_help" })]);
    expect(data.events).toHaveLength(1);
    expect(data.ledger).toHaveLength(1);
    expect(data.rewardClaims).toHaveLength(3);
    expect(data.nominations).toEqual([]);
    expect(data.renderJobs).toEqual([expect.objectContaining({ id: "job-a", status: "done" })]);
    expect(data.moderationHistory).toHaveLength(2);
    const json = JSON.stringify(data);
    expect(json).not.toContain("secret-token-hash");
    expect(json).not.toContain('"actorId"');
    for (const column of ['"decidedBy"', '"resolvedBy"', '"awardedBy"']) expect(json).not.toContain(column);
    expect(json).not.toContain("mod-x");
    expect(data.ledger).toEqual([expect.objectContaining({ reason: "awarded_by:admin" })]);
  });

  it("is a 404 for an unknown id and a 400 for malformed or tombstone ids", async () => {
    await expect(exportBuilderData(env.db, "ghost")).rejects.toMatchObject({ status: 404 });
    await expect(exportBuilderData(env.db, "bad id!")).rejects.toMatchObject({ status: 400, code: "invalid_user_id" });
    await expect(exportBuilderData(env.db, "deleted-123")).rejects.toMatchObject({ status: 400, code: "invalid_user_id" });
  });

  it("exports a member with an account but no league data", async () => {
    const data = await exportBuilderData(env.db, "admin");
    expect(data.evidence).toEqual([]);
  });
});

describe("deleteBuilderData", () => {
  it("deletes private files and personal rows, and pseudonymises history", async () => {
    await seedAlice();
    const result = await deleteBuilderData(env.db, "alice", { actorId: "admin" });

    expect(result.tombstoneId).toMatch(/^deleted-[0-9a-f-]{36}$/);
    expect(result.nothingToDo).toBe(false);
    expect(result.objectsDeleted).toBe(4);
    for (const key of ALICE_KEYS) expect(await bucket().get(key)).toBeNull();
    expect(await bucket().get(BOB_KEY)).not.toBeNull();

    expect(result.deleted).toMatchObject({
      activityEvidence: 1,
      evidenceAppeals: 1,
      builderPrivacy: 1,
      builderPilotMembers: 1,
      builderProjects: 2,
      badgeAwards: 1,
      rankAwards: 1,
      mentorNominations: 1,
      seasonEnrollments: 1,
      rewardClaims: 3,
      timeCapsuleEntries: 1,
      yearlySnapshots: 1,
      renderJobs: 1,
      shareAttributions: 2,
      builderShareLinks: 1,
    });
    expect(result.pseudonymised).toMatchObject({
      builderEvents: 1,
      builderEventActors: 1,
      builderEventCounterparties: 1,
      scoreLedger: 1,
      scoreLedgerAwarders: 1,
      scoreCapSlots: 1,
      capSlotKeys: 2,
      yearReviewMentions: 1,
      moderationTargets: 1,
      leagueSnapshots: 1,
      counterpartyMentions: 1,
      evidenceDecisions: 1,
      claimDecisions: 1,
      rankAwarders: 1,
      attributionVisitors: 1,
    });

    const tomb = result.tombstoneId;
    const [aliceEvent] = await env.db.select().from(builderEvents).where(eq(builderEvents.id, "e-a"));
    expect(aliceEvent.subjectUserId).toBe(tomb);
    const [bobEvent] = await env.db.select().from(builderEvents).where(eq(builderEvents.id, "e-b"));
    expect(bobEvent).toMatchObject({ subjectUserId: "bob", actorUserId: tomb, payload: { counterpartyUserId: tomb, title: "Helped" } });
    const ledgerRows = await env.db.select().from(scoreLedger).orderBy(scoreLedger.id);
    expect(ledgerRows.map((row) => [row.id, row.userId, row.rp, row.reason])).toEqual([
      ["l-a", tomb, 30, "awarded_by:admin:mod-x"],
      ["l-b", "bob", 5, `awarded_by:member:${tomb}`],
    ]);
    const [snapshot] = await env.db.select().from(leagueSnapshots);
    expect(snapshot.eventHash).toBe("hash-unchanged");
    expect(snapshot.entries).toEqual([
      { userId: tomb, rp: 30, rank: 1 },
      { userId: "bob", rp: 5, rank: 2 },
    ]);
    const [limited] = await env.db.select().from(rewardItems).where(eq(rewardItems.id, "r-1"));
    expect(limited.inventory).toBe(3);
    const [bobEvidence] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, "ev-b"));
    expect(bobEvidence).toMatchObject({ counterpartyUserId: tomb, decidedBy: tomb, privateObjectKeys: [BOB_KEY] });
    const [visitor] = await env.db.select().from(shareAttributions).where(eq(shareAttributions.id, "sa-3"));
    expect(visitor.userId).toBeNull();
    const slots = await env.db.select().from(scoreCapSlots).orderBy(scoreCapSlots.entryId);
    expect(slots.map((slot) => [slot.slotKey, slot.userId])).toEqual([
      [`${tomb}|ship_public_post|p-alice|2026-W40|0`, tomb],
      [`bob|contribute_peer_help|${tomb}|2026-W41|0`, "bob"],
    ]);
    const [bobYear] = await env.db.select().from(yearlySnapshots).where(eq(yearlySnapshots.id, "ys-b"));
    expect(bobYear.data).toEqual({ year: 2026, peerMentions: [{ userId: "carol", name: "Carol" }] });

    expect(await mentions("alice")).toEqual([]);
    const [audit] = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.targetType, "privacy_request"));
    expect(audit).toMatchObject({ targetId: tomb, action: "delete", actorId: "admin", reasonCodes: ["privacy_delete"] });
    expect(audit.notes).not.toContain("alice");
    expect(await env.db.select({ id: users.id }).from(users).where(eq(users.id, "alice"))).toHaveLength(1);
  });

  it("is idempotent", async () => {
    await seedAlice();
    await deleteBuilderData(env.db, "alice", { actorId: "admin" });
    const again = await deleteBuilderData(env.db, "alice", { actorId: "admin" });
    expect(again.nothingToDo).toBe(true);
    expect(again.objectsDeleted).toBe(0);
    const audits = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.targetType, "privacy_request"));
    expect(audits).toHaveLength(1);
  });

  it("changes nothing in D1 when a private file cannot be deleted", async () => {
    await seedAlice();
    const failing: PrivacyBucket = {
      delete: async () => {
        throw new Error("R2 unavailable");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(deleteBuilderData(env.db, "alice", { actorId: "admin", bucket: failing })).rejects.toMatchObject({ status: 502, code: "storage_delete_failed" });
    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(1);
    expect(await env.db.select().from(builderPilotMembers).where(eq(builderPilotMembers.userId, "alice"))).toHaveLength(1);
    expect((await env.db.select().from(builderEvents).where(eq(builderEvents.id, "e-a")))[0].subjectUserId).toBe("alice");
    vi.mocked(console.error).mockRestore();
  });

  it("refuses invalid ids and a missing actor", async () => {
    await expect(deleteBuilderData(env.db, "deleted-x", { actorId: "admin" })).rejects.toBeInstanceOf(BuilderApiError);
    await expect(deleteBuilderData(env.db, "alice", { actorId: "" })).rejects.toMatchObject({ status: 400, code: "actor_required" });
  });
});

describe("privacy admin routes", () => {
  const exportCall = (user: string | null, id = "alice", auth?: string) =>
    call(() => exportRoute(jsonRequest(`/api/v1/builder-admin/privacy/${id}/export`, user, undefined, { auth }), params(id)));
  const deleteCall = (user: string | null, body: unknown, id = "alice", auth?: string) =>
    call(() => deleteRoute(jsonRequest(`/api/v1/builder-admin/privacy/${id}/delete`, user, body, { auth }), params(id)));

  it("hides both routes from members and signed-out callers", async () => {
    expect((await exportCall(null)).status).toBe(404);
    expect((await exportCall("alice")).status).toBe(404);
    expect((await deleteCall("bob", { confirm: "alice" })).status).toBe(404);
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    expect((await exportCall("alice")).status).toBe(403);
    expect((await exportCall(null)).status).toBe(401);
  });

  it("refuses API keys even for admins", async () => {
    const res = await exportCall("admin", "alice", "api_key");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "session_required" } });
  });

  it("exports as an audited JSON attachment", async () => {
    await seedAlice();
    const res = await exportCall("admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="builder-league-export-alice.json"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toMatchObject({ userId: "alice" });
    const audits = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.action, "export"));
    expect(audits).toEqual([expect.objectContaining({ targetType: "privacy_request", targetId: "alice", actorId: "admin" })]);
    expect((await exportCall("admin", "ghost")).status).toBe(404);
  });

  it("requires a JSON body that repeats the member id", async () => {
    await seedAlice();
    expect((await deleteCall("admin", {})).status).toBe(400);
    const mismatch = await deleteCall("admin", { confirm: "bob" });
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ error: { code: "confirmation_mismatch" } });
    const form = new Request("https://nlb.test/api/v1/builder-admin/privacy/alice/delete", {
      method: "POST",
      headers: { "x-test-user": "admin", "content-type": "text/plain" },
      body: JSON.stringify({ confirm: "alice" }),
    });
    expect((await call(() => deleteRoute(form, params("alice")))).status).toBe(415);
    expect((await deleteCall("admin", { confirm: "admin" }, "admin")).status).toBe(400);
    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(1);
  });

  it("deletes with a confirmed request", async () => {
    await seedAlice();
    const res = await deleteCall("admin", { confirm: "alice" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ nothingToDo: false, objectsDeleted: 4 });
    expect(await env.db.select().from(builderProjects).where(eq(builderProjects.ownerUserId, "alice"))).toHaveLength(0);
  });

  it("documents both routes in OpenAPI", () => {
    expect(Object.keys(privacyPaths)).toEqual(
      expect.arrayContaining(["/api/v1/builder-admin/privacy/{userId}/export", "/api/v1/builder-admin/privacy/{userId}/delete"])
    );
    expect(Object.keys(privacySchemas)).toEqual(["BuilderPrivacyExport", "BuilderPrivacyDeletion"]);
  });
});
