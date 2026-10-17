import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCaller } from "@/lib/auth-api-key";

const resolveCallerMock = vi.fn<(headers: Headers) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: (headers: Headers) => resolveCallerMock(headers) }));
vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: undefined, vip: undefined },
}));

import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { runWithDb } from "@/lib/db";
import { activityEvidence, badgeAwards, builderPrivacy, builderProjects } from "@/lib/db/schema";
import { getPassport } from "@/lib/builder-league/passport";
import { periodKey } from "@/lib/builder-league/time-windows";
import { GET as getPassportRoute } from "@/app/api/v1/builder-passport/[userId]/route";
import { GET as getMe, PATCH as patchMe } from "@/app/api/v1/builder-me/route";
import { GET as getRankings } from "@/app/api/v1/builder-rankings/route";
import { POST as postNomination } from "@/app/api/v1/builder-admin/nominations/route";
import { POST as postFinalize } from "@/app/api/v1/builder-admin/snapshots/finalize/route";
import { addEvent, addLedger, addUsers, local, optIn, reverse } from "./leaderboards-fixtures";

let d1: LocalD1;
let db: LocalD1["db"];

const SECRET_TITLE = "Secret pricing experiment";
const PRIVATE_PROJECT = "Stealth project";

async function evidence(id: string, values: { title: string; visibility: "private" | "public"; links?: string[]; eventType?: string }) {
  await db.insert(activityEvidence).values({
    id,
    userId: "owner",
    eventType: values.eventType ?? "ship_public_post",
    stage: "ship",
    title: values.title,
    occurredAt: local(2026, 9, 10),
    links: values.links ?? [],
    status: "approved",
    source: "member",
    visibility: values.visibility,
    clientKey: id,
  });
}

async function milestone(eventType: string, options: { visibility: "private" | "public"; evidenceId?: string; projectId?: string }) {
  const at = local(2026, 9, 10);
  const eventId = await addEvent(db, "owner", { stage: "ship", eventType, at, visibility: options.visibility, evidenceId: options.evidenceId, projectId: options.projectId });
  const entry = { stage: "ship" as const, rp: 10, at, awardType: eventType, eventId };
  const entryId = await addLedger(db, "owner", entry);
  return { entryId, entry };
}

beforeAll(async () => {
  d1 = await createLocalD1();
  db = d1.db;
  await addUsers(db, ["owner", "stranger", "member", "hidden"]);
  await addUsers(db, ["admin"], { role: "admin" });
  await db.insert(builderProjects).values([
    { id: "p-public", ownerUserId: "owner", name: "Open project", slug: "open", visibility: "public", stage: "ship" },
    { id: "p-private", ownerUserId: "owner", name: PRIVATE_PROJECT, slug: "stealth", visibility: "private" },
    { id: "p-archived", ownerUserId: "owner", name: "Old project", slug: "old", visibility: "public", archivedAt: local(2026, 9, 1) },
  ]);
  await evidence("ev-public", { title: "Launch post", visibility: "public", links: ["https://example.com/launch"] });
  await evidence("ev-private", { title: SECRET_TITLE, visibility: "private", links: ["https://example.com/secret"] });
  await evidence("ev-payment", { title: "First 500 USD payment", visibility: "public", links: ["https://example.com/invoice"], eventType: "ship_first_payment" });
  await milestone("ship_public_post", { visibility: "public", evidenceId: "ev-public", projectId: "p-public" });
  await milestone("ship_highlighted_post", { visibility: "private" });
  await milestone("ship_distribution_case_study", { visibility: "public", evidenceId: "ev-private" });
  await milestone("ship_product_launch", { visibility: "public", projectId: "p-private" });
  await milestone("ship_first_payment", { visibility: "public", evidenceId: "ev-payment" });
  const reversed = await milestone("ship_public_post", { visibility: "public" });
  await reverse(db, "owner", reversed.entryId, reversed.entry);
  await db.insert(badgeAwards).values([
    { userId: "owner", badgeKey: "first_ship" },
    { userId: "owner", badgeKey: "revoked_badge", revokedAt: local(2026, 9, 20), revokeReason: "test" },
  ]);
  await optIn(db, "owner", { passportPublic: true });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await d1.dispose();
});

beforeEach(() => {
  resolveCallerMock.mockReset();
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
});

describe("builder passport", () => {
  it("shows only consented, public, verified items to other viewers", async () => {
    const passport = await getPassport(db, "owner", { id: "stranger" });
    expect(passport?.view).toBe("public");
    expect(passport?.milestones.map((m) => m.eventType).sort()).toEqual(["ship_first_payment", "ship_product_launch", "ship_public_post"]);
    expect(passport?.milestones.find((m) => m.eventType === "ship_public_post")).toMatchObject({
      title: "Launch post",
      links: ["https://example.com/launch"],
      projectId: "p-public",
    });
    // Financial details are redacted by default; a private project is never linked.
    expect(passport?.milestones.find((m) => m.eventType === "ship_first_payment")).toMatchObject({ title: null, links: [] });
    expect(passport?.milestones.find((m) => m.eventType === "ship_product_launch")?.projectId).toBeNull();
    expect(passport?.projects.map((p) => p.id)).toEqual(["p-public"]);
    expect(passport?.badges.map((b) => b.badgeKey)).toEqual(["first_ship"]);
    expect(passport?.proofLinks).toEqual(["https://example.com/launch"]);
    expect(passport?.privacy).toBeUndefined();

    const serialized = JSON.stringify(passport);
    for (const leak of [SECRET_TITLE, PRIVATE_PROJECT, "p-private", "https://example.com/secret", "https://example.com/invoice", "500 USD", "visibility"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("shows payment details publicly only after the member turns redaction off", async () => {
    await optIn(db, "owner", { passportPublic: true, redactFinancials: false });
    const passport = await getPassport(db, "owner", null);
    expect(passport?.milestones.find((m) => m.eventType === "ship_first_payment")).toMatchObject({ title: "First 500 USD payment" });
    await optIn(db, "owner", { passportPublic: true, redactFinancials: true });
  });

  it("gives the member and admins the full private view", async () => {
    for (const viewer of [{ id: "owner" }, { id: "admin", isAdmin: true }]) {
      const passport = await getPassport(db, "owner", viewer);
      expect(passport?.view).toBe("private");
      expect(passport?.milestones).toHaveLength(5);
      expect(passport?.projects.map((p) => p.id).sort()).toEqual(["p-private", "p-public"]);
      expect(passport?.privacy).toMatchObject({ passportPublic: true, leaderboardPublic: false });
    }
    expect((await getPassport(db, "owner", { id: "owner" }, { audience: "public" }))?.view).toBe("public");
  });

  it("returns nothing without consent", async () => {
    await addLedger(db, "hidden", { stage: "ship", rp: 10, at: local(2026, 9, 10) });
    expect(await getPassport(db, "hidden", { id: "stranger" })).toBeNull();
    expect(await getPassport(db, "hidden", null)).toBeNull();
    expect(await getPassport(db, "missing-user", { id: "admin", isAdmin: true })).toBeNull();
    await db.insert(builderPrivacy).values({ userId: "hidden", leaderboardPublic: true }).onConflictDoNothing();
    expect(await getPassport(db, "hidden", null)).toBeNull();
  });
});

const caller = (id: string, authType: ResolvedCaller["authType"] = "session", role = "user"): ResolvedCaller => ({
  user: { id, name: id, email: `${id}@example.com`, role, emailVerified: true },
  authType,
});
const call = <T>(fn: () => Promise<T>) => runWithDb(db, fn);
const passportRoute = (userId: string) =>
  call(() => getPassportRoute(new Request(`https://example.test/api/v1/builder-passport/${userId}`), { params: Promise.resolve({ userId }) }));
const jsonRequest = (path: string, method: string, body?: unknown) =>
  new Request(`https://example.test${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("builder rankings and passport routes", () => {
  it("returns 404 everywhere while the flag is off for non-members", async () => {
    resolveCallerMock.mockResolvedValue(null);
    expect((await passportRoute("owner")).status).toBe(404);
    expect((await call(() => getMe(new Request("https://example.test/api/v1/builder-me")))).status).toBe(404);

    resolveCallerMock.mockResolvedValue(caller("member"));
    const rankings = await call(() => getRankings(new Request("https://example.test/api/v1/builder-rankings?board=overall")));
    expect(rankings.status).toBe(404);
    expect(await rankings.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
    expect((await call(() => postNomination(jsonRequest("/api/v1/builder-admin/nominations", "POST", { nomineeUserId: "owner" })))).status).toBe(404);
    expect((await call(() => postFinalize(jsonRequest("/api/v1/builder-admin/snapshots/finalize", "POST")))).status).toBe(404);
  });

  it("serves admins during the pilot", async () => {
    resolveCallerMock.mockResolvedValue(caller("admin", "session", "admin"));
    const passport = await passportRoute("owner");
    expect(passport.status).toBe(200);
    expect((await passport.json()).data.view).toBe("private");

    const me = await call(() => getMe(new Request("https://example.test/api/v1/builder-me")));
    expect(me.status).toBe(200);
    expect((await me.json()).data).toMatchObject({ userId: "admin", rank: { current: "apprentice" }, privacy: { leaderboardPublic: false } });

    const rankings = await call(() => getRankings(new Request("https://example.test/api/v1/builder-rankings?board=ship&period=month&key=2026-09")));
    expect(rankings.status).toBe(200);
    // "owner" scores more but only shares a passport; "hidden" opted into boards only.
    const board = (await rankings.json()).data;
    expect(board).toMatchObject({ board: "ship", periodKey: "2026-09", viewer: null });
    expect(board.entries.map((entry: { userId: string }) => entry.userId)).toEqual(["hidden"]);
    expect((await call(() => getRankings(new Request("https://example.test/api/v1/builder-rankings?board=tier")))).status).toBe(400);

    const nomination = await call(() => postNomination(jsonRequest("/api/v1/builder-admin/nominations", "POST", { nomineeUserId: "owner" })));
    expect(nomination.status).toBe(201);
    expect((await nomination.json()).data).toMatchObject({ created: true, rank: "legend", currentRank: "apprentice", awarded: null });
    expect((await call(() => postNomination(jsonRequest("/api/v1/builder-admin/nominations", "POST", { nomineeUserId: "admin" })))).status).toBe(400);

    const notDue = await call(() =>
      postFinalize(jsonRequest("/api/v1/builder-admin/snapshots/finalize", "POST", { periodType: "week", periodKey: periodKey("week", new Date()) }))
    );
    expect(notDue.status).toBe(409);
  });

  it("changes privacy only from a session", async () => {
    resolveCallerMock.mockResolvedValue(caller("admin", "api_key", "admin"));
    const viaKey = await call(() => patchMe(jsonRequest("/api/v1/builder-me", "PATCH", { privacy: { leaderboardPublic: true } })));
    expect(viaKey.status).toBe(403);

    resolveCallerMock.mockResolvedValue(caller("admin", "session", "admin"));
    const invalid = await call(() => patchMe(jsonRequest("/api/v1/builder-me", "PATCH", { privacy: { tier: "vip" } })));
    expect(invalid.status).toBe(400);
    const updated = await call(() => patchMe(jsonRequest("/api/v1/builder-me", "PATCH", { privacy: { leaderboardPublic: true } })));
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.privacy).toMatchObject({ leaderboardPublic: true, passportPublic: false, redactFinancials: true });
  });

  it("serves consented passports to anyone once the flag is on", async () => {
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    resolveCallerMock.mockResolvedValue(null);
    const open = await passportRoute("owner");
    expect(open.status).toBe(200);
    const body = await open.json();
    expect(body.data.view).toBe("public");
    expect(JSON.stringify(body)).not.toContain(SECRET_TITLE);
    expect((await passportRoute("hidden")).status).toBe(404);
    expect((await call(() => getMe(new Request("https://example.test/api/v1/builder-me")))).status).toBe(401);
  });
});
