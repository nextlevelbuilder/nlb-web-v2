import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: "", vip: "" },
  productIdsForPlans: (plans: readonly ("premium" | "vip")[]) =>
    plans.flatMap((plan) => ({ premium: ["prod_premium"], vip: ["prod_vip"] })[plan]),
}));

import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { authorize } from "@/lib/access/authorize";
import { resourceKey, type AccessAction, type AccessResource, type AccessSubject } from "@/lib/access/types";
import { assets, builderPilotMembers, members, organizations } from "@/lib/db/schema";
import { apiKey, delegation, seedSubscription, seedUsers, session } from "./access-fixtures";

let local: LocalD1;

beforeAll(async () => {
  local = await createLocalD1();
  const { db } = local;
  await seedUsers(db, [{ id: "owner" }, { id: "stranger" }, { id: "banned-owner", banned: true }, { id: "paid" }, { id: "pilot" }, { id: "admin" }]);
  await db.insert(organizations).values({ id: "org_1", name: "Org", slug: "org-1" });
  await db.insert(members).values([
    { id: "m1", organizationId: "org_1", userId: "owner" },
    { id: "m2", organizationId: "org_1", userId: "banned-owner" },
  ]);
  await db.insert(assets).values([
    { id: "asset_public", orgId: "org_1", storageKey: "staging/org_1/common/a.png", mimeType: "image/png", sizeBytes: 1, checksumSha256: "x", status: "approved", publicUrl: "https://cdn.test/a.png" },
    { id: "asset_staging", orgId: "org_1", storageKey: "staging/org_1/common/b.png", mimeType: "image/png", sizeBytes: 1, checksumSha256: "x", status: "staging" },
  ]);
  await seedSubscription(db, "paid", "prod_premium");
  await seedSubscription(db, "pilot", "prod_vip");
  await db.insert(builderPilotMembers).values({ userId: "pilot", addedBy: "admin" });
  await local.d1.prepare("update users set role = 'admin' where id = 'admin'").run();
});

afterAll(async () => {
  await local?.dispose();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const check = (subject: AccessSubject, action: AccessAction, resource: AccessResource) => authorize({ subject, action, resource }, { db: local.db });
const anonymous: AccessSubject = { userId: null, authType: "anonymous" };

describe("authorize: asset:<id> download", () => {
  const publicAsset: AccessResource = { kind: "asset", id: "asset_public" };
  const stagingAsset: AccessResource = { kind: "asset", id: "asset_staging" };

  it("lets anyone download a promoted asset", async () => {
    expect(await check(anonymous, "download", publicAsset)).toEqual({ allow: true, basis: ["public"] });
    expect(await check(session("stranger"), "download", publicAsset)).toEqual({ allow: true, basis: ["public"] });
  });

  it("limits an unpromoted asset to members of the owning organization", async () => {
    expect(await check(session("owner"), "download", stagingAsset)).toEqual({ allow: true, basis: ["org_member"] });
    expect(await check(apiKey("owner"), "download", stagingAsset)).toEqual({ allow: true, basis: ["org_member"] });
    expect(await check(session("stranger"), "download", stagingAsset)).toEqual({ allow: false, reason: "no_entitlement" });
    expect(await check(anonymous, "download", stagingAsset)).toEqual({ allow: false, reason: "unauthenticated" });
    expect(await check(session("banned-owner"), "download", stagingAsset)).toEqual({ allow: false, reason: "banned" });
    expect(await check(delegation("owner", ["mcp:keys"]), "download", stagingAsset)).toEqual({ allow: false, reason: "insufficient_scope" });
  });

  it("answers not_available for a missing asset and for other actions", async () => {
    expect(await check(session("owner"), "download", { kind: "asset", id: "missing" })).toEqual({ allow: false, reason: "not_available" });
    expect(await check(session("owner"), "read", stagingAsset)).toEqual({ allow: false, reason: "not_available" });
  });
});

describe("authorize: org, leaderboard and Builder League", () => {
  it("lets organization members read their organization only", async () => {
    const org: AccessResource = { kind: "org", id: "org_1" };
    expect(await check(session("owner"), "read", org)).toEqual({ allow: true, basis: ["org_member"] });
    expect(await check(session("stranger"), "read", org)).toEqual({ allow: false, reason: "no_entitlement" });
    expect(await check(anonymous, "read", org)).toEqual({ allow: false, reason: "unauthenticated" });
  });

  it("treats leaderboards as public reads", async () => {
    expect(await check(anonymous, "read", { kind: "leaderboard", board: "directory" })).toEqual({ allow: true, basis: ["public"] });
    expect(await check(anonymous, "participate", { kind: "leaderboard", board: "directory" })).toEqual({ allow: false, reason: "not_available" });
  });

  it("follows Builder League access: pilot paid members while the flag is off, every paid member once it is on", async () => {
    const league: AccessResource = { kind: "builder_league" };
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
    expect(await check(session("pilot"), "participate", league)).toEqual({ allow: true, basis: ["builder_league_member"] });
    expect(await check(session("admin"), "read", league)).toEqual({ allow: true, basis: ["builder_league_member"] });
    expect(await check(session("paid"), "read", league)).toEqual({ allow: false, reason: "no_entitlement" });
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    expect(await check(session("paid"), "read", league)).toEqual({ allow: true, basis: ["builder_league_member"] });
    expect(await check(session("stranger"), "read", league)).toEqual({ allow: false, reason: "no_entitlement" });
    // Participating is a write: a read-only delegation may look but not act.
    expect(await check(delegation("paid", ["mcp:read"]), "read", league)).toEqual({ allow: true, basis: ["builder_league_member"] });
    expect(await check(delegation("paid", ["mcp:read"]), "participate", league)).toEqual({ allow: false, reason: "insufficient_scope" });
  });

  it("formats the new resource strings", () => {
    expect(resourceKey({ kind: "org", id: "o" })).toBe("org:o");
    expect(resourceKey({ kind: "builder_league" })).toBe("builder:league");
    expect(resourceKey({ kind: "leaderboard", board: "rising" })).toBe("leaderboard:rising");
  });
});
