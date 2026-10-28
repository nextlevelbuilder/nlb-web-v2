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

import { eq } from "drizzle-orm";
import { runWithDb } from "@/lib/db";
import { activityEvidence, badgeAwards, builderModerationActions, builderPilotMembers, builderProjects, builderShareLinks, scoreLedger } from "@/lib/db/schema";
import { privacyPaths } from "@/lib/builder-league/openapi/privacy";
import { deleteOwnBuilderData, type PrivacyBucket } from "@/lib/builder-league/privacy-requests";
import { GET as exportRoute } from "@/app/api/v1/builder-me/export/route";
import { POST as deleteRoute } from "@/app/api/v1/builder-me/delete/route";
import { handleSelfDeleteForm, isSelfDeleteError } from "@/components/builder-league/settings/self-delete-form-handler";
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
  await seedLeagueData();
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);
const bucket = () => env.bucket as unknown as PrivacyBucket & { get(key: string): Promise<unknown>; put(key: string, value: Uint8Array): Promise<unknown> };
const day = (n: number) => new Date(TEST_NOW.getTime() - n * 86_400_000);
const ALICE_KEY = "evidence/alice/ev-a/proof.png";
const BOB_KEY = "evidence/bob/ev-b/proof.png";

/** Alice and Bob each hold evidence (with a private file), a ledger entry, a badge and a share link. */
async function seedLeagueData() {
  const db = env.db;
  await bucket().put(ALICE_KEY, new Uint8Array([1]));
  await bucket().put(BOB_KEY, new Uint8Array([2]));
  const evidence = (id: string, userId: string, projectId: string, key: string) => ({
    id, userId, projectId, eventType: "ship_public_post", stage: "ship" as const, title: "Launch", occurredAt: day(10),
    source: "member" as const, clientKey: id, privateObjectKeys: [key], status: "approved" as const, decidedBy: "admin",
  });
  const ledger = (id: string, userId: string) => ({
    id, userId, eventId: `evt-${id}`, awardType: "activity" as const, stage: "ship" as const, rp: 30, rulesetVersion: "v2", dedupeKey: id, occurredAt: day(10),
  });
  await db.batch([
    db.insert(activityEvidence).values(evidence("ev-a", "alice", "p-alice", ALICE_KEY)),
    db.insert(activityEvidence).values(evidence("ev-b", "bob", "p-bob", BOB_KEY)),
    db.insert(scoreLedger).values(ledger("l-a", "alice")),
    db.insert(scoreLedger).values(ledger("l-b", "bob")),
    db.insert(badgeAwards).values({ id: "badge-a", userId: "alice", badgeKey: "first_ship" }),
    db.insert(badgeAwards).values({ id: "badge-b", userId: "bob", badgeKey: "first_ship" }),
    db.insert(builderShareLinks).values({ id: "sl-a", tokenHash: "alice-hash", userId: "alice", kind: "passport" }),
    db.insert(builderShareLinks).values({ id: "sl-b", tokenHash: "bob-hash", userId: "bob", kind: "passport" }),
  ]);
}

const exportCall = (user: string | null, auth?: string, path = "/api/v1/builder-me/export") =>
  call(() => exportRoute(jsonRequest(path, user, undefined, { auth })));
const deleteCall = (user: string | null, body: unknown, auth?: string) =>
  call(() => deleteRoute(jsonRequest("/api/v1/builder-me/delete", user, body, { auth })));

async function expectBobUntouched() {
  expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "bob"))).toHaveLength(1);
  expect(await env.db.select().from(scoreLedger).where(eq(scoreLedger.userId, "bob"))).toHaveLength(1);
  expect(await env.db.select().from(badgeAwards).where(eq(badgeAwards.userId, "bob"))).toHaveLength(1);
  expect(await env.db.select().from(builderProjects).where(eq(builderProjects.ownerUserId, "bob"))).toHaveLength(1);
  expect(await env.db.select().from(builderPilotMembers).where(eq(builderPilotMembers.userId, "bob"))).toHaveLength(1);
  expect(await bucket().get(BOB_KEY)).not.toBeNull();
}

describe("GET /api/v1/builder-me/export", () => {
  it("is a 404 for everyone outside the league while the flag is off", async () => {
    expect((await exportCall(null)).status).toBe(404);
    expect((await exportCall("outsider")).status).toBe(404);
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    expect((await exportCall(null)).status).toBe(401);
    // A signed-in account without a membership; the paid non-pilot member gets in once the flag is on.
    expect((await exportCall("stranger")).status).toBe(403);
    expect((await exportCall("outsider")).status).toBe(200);
  });

  it("exports only the caller's own data as an audited attachment", async () => {
    // A userId in the query is ignored: the export is always the caller's.
    const res = await exportCall("alice", undefined, "/api/v1/builder-me/export?userId=bob");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="builder-league-export-alice.json"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = await res.json();
    expect(data.userId).toBe("alice");
    expect(data.evidence.map((row: { id: string }) => row.id)).toEqual(["ev-a"]);
    expect(data.ledger.map((row: { id: string }) => row.id)).toEqual(["l-a"]);
    expect(JSON.stringify(data)).not.toContain("bob");
    // The moderator who approved the evidence is not named in the member's own export.
    expect(data.evidence[0]).not.toHaveProperty("decidedBy");
    const audits = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.action, "export"));
    expect(audits).toEqual([expect.objectContaining({ targetType: "privacy_request", targetId: "alice", actorId: "alice", actorRole: "member", reasonCodes: ["self_service"] })]);
  });

  it("accepts an API key or agent with builder:read, still for the caller only", async () => {
    const viaKey = await exportCall("bob", "api_key");
    expect(viaKey.status).toBe(200);
    expect((await viaKey.json()).data.userId).toBe("bob");
    const viaAgent = await exportCall("bob", "delegation");
    expect(viaAgent.status).toBe(200);
    const roles = (await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.action, "export"))).map((row) => row.actorRole);
    expect(roles.sort()).toEqual(["agent", "api"]);
  });
});

describe("POST /api/v1/builder-me/delete", () => {
  it("is a 404 for everyone outside the league while the flag is off", async () => {
    expect((await deleteCall(null, { confirm: "DELETE" })).status).toBe(404);
    expect((await deleteCall("outsider", { confirm: "DELETE" })).status).toBe(404);
  });

  it("refuses API keys and MCP agents, and changes nothing", async () => {
    for (const auth of ["api_key", "delegation"]) {
      const res = await deleteCall("alice", { confirm: "DELETE" }, auth);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "session_required" } });
    }
    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(1);
    expect(await bucket().get(ALICE_KEY)).not.toBeNull();
  });

  it("requires a JSON body that confirms with DELETE", async () => {
    const missing = await deleteCall("alice", {});
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { code: "validation_failed" } });
    const wrong = await deleteCall("alice", { confirm: "delete" });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ error: { code: "confirmation_mismatch" } });
    expect((await deleteCall("alice", { confirm: "DELETE", userId: "bob" })).status).toBe(400);
    const text = new Request("https://nlb.test/api/v1/builder-me/delete", {
      method: "POST",
      headers: { "x-test-user": "alice", "content-type": "text/plain" },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    expect((await call(() => deleteRoute(text))).status).toBe(415);
    const crossSite = new Request("https://nlb.test/api/v1/builder-me/delete", {
      method: "POST",
      headers: { "x-test-user": "alice", "content-type": "application/json", origin: "https://evil.test", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    expect((await call(() => deleteRoute(crossSite))).status).toBe(403);
    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(1);
  });

  it("refuses admins, who must ask another admin", async () => {
    const res = await deleteCall("admin", { confirm: "DELETE" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "admin_self_delete" } });
    expect(await env.db.select().from(builderProjects).where(eq(builderProjects.ownerUserId, "admin"))).toHaveLength(1);
  });

  it("deletes the caller's data only, with an audit row that does not name them", async () => {
    const res = await deleteCall("alice", { confirm: "DELETE" });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ nothingToDo: false, objectsDeleted: 1 });
    expect(data.tombstoneId).toMatch(/^deleted-/);

    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(0);
    expect(await env.db.select().from(builderProjects).where(eq(builderProjects.ownerUserId, "alice"))).toHaveLength(0);
    expect(await env.db.select().from(badgeAwards).where(eq(badgeAwards.userId, "alice"))).toHaveLength(0);
    expect(await env.db.select().from(builderShareLinks).where(eq(builderShareLinks.userId, "alice"))).toHaveLength(0);
    expect(await bucket().get(ALICE_KEY)).toBeNull();
    const [kept] = await env.db.select().from(scoreLedger).where(eq(scoreLedger.id, "l-a"));
    expect(kept.userId).toBe(data.tombstoneId);
    await expectBobUntouched();

    const audits = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.action, "delete"));
    expect(audits).toEqual([
      expect.objectContaining({ targetType: "privacy_request", targetId: data.tombstoneId, actorId: data.tombstoneId, actorRole: "member", reasonCodes: ["privacy_delete", "self_service"] }),
    ]);
    expect(JSON.stringify(audits)).not.toContain("alice");
  });
});

describe("settings form deletion", () => {
  const form = (confirm?: string) => {
    const data = new FormData();
    data.set("locale", "vi");
    if (confirm !== undefined) data.set("confirm", confirm);
    return data;
  };

  it("rejects a missing or wrong confirmation without deleting", async () => {
    expect(await handleSelfDeleteForm(env.db, { userId: "alice", isAdmin: false }, form())).toEqual({ ok: false, error: "confirm" });
    expect(await handleSelfDeleteForm(env.db, { userId: "alice", isAdmin: false }, form("DELET"))).toEqual({ ok: false, error: "confirm" });
    expect(await handleSelfDeleteForm(env.db, { userId: "admin", isAdmin: true }, form("DELETE"))).toEqual({ ok: false, error: "admin" });
    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(1);
  });

  it("deletes the signed-in member's data and is idempotent", async () => {
    expect(await handleSelfDeleteForm(env.db, { userId: "alice", isAdmin: false }, form(" DELETE "), { bucket: bucket() })).toEqual({ ok: true, nothingToDo: false });
    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(0);
    await expectBobUntouched();
    expect(await handleSelfDeleteForm(env.db, { userId: "alice", isAdmin: false }, form("DELETE"), { bucket: bucket() })).toEqual({ ok: true, nothingToDo: true });
  });

  it("reports a storage failure and leaves D1 unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: PrivacyBucket = { delete: async () => { throw new Error("r2 down"); } };
    expect(await handleSelfDeleteForm(env.db, { userId: "alice", isAdmin: false }, form("DELETE"), { bucket: failing })).toEqual({ ok: false, error: "storage" });
    expect(await env.db.select().from(activityEvidence).where(eq(activityEvidence.userId, "alice"))).toHaveLength(1);
    vi.mocked(console.error).mockRestore();
  });

  it("only shows known error keys", () => {
    expect(isSelfDeleteError("confirm")).toBe(true);
    expect(isSelfDeleteError("<script>")).toBe(false);
    expect(isSelfDeleteError(["confirm"])).toBe(false);
  });
});

describe("deleteOwnBuilderData", () => {
  it("only accepts the exact confirmation word", async () => {
    await expect(deleteOwnBuilderData(env.db, { userId: "alice", isAdmin: false, confirm: "yes" })).rejects.toMatchObject({ status: 400, code: "confirmation_mismatch" });
    await expect(deleteOwnBuilderData(env.db, { userId: "alice", isAdmin: false, confirm: null })).rejects.toMatchObject({ code: "confirmation_mismatch" });
  });
});

describe("OpenAPI", () => {
  it("documents both self-service routes; delete is session-only", () => {
    expect(privacyPaths).toHaveProperty(["/api/v1/builder-me/export", "get"]);
    const del = (privacyPaths["/api/v1/builder-me/delete"] as { post: { security: unknown[] } }).post;
    expect(del.security).toEqual([{ SessionAuth: [] }]);
  });
});
