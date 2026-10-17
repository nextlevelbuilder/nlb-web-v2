import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCaller } from "@/lib/auth-api-key";

const resolveCallerMock = vi.fn<(headers: Headers) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: (headers: Headers) => resolveCallerMock(headers) }));
vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: undefined, vip: undefined },
}));

import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { builderPilotMembers, communityConnections, customers, subscriptions, users } from "@/lib/db/schema";
import {
  getViewerAccess,
  isBuilderLeagueEnabled,
  requireBuilderLeagueAdmin,
  requireBuilderLeagueUser,
} from "@/lib/builder-league/access";
import { getCommunityTier, getDiscordIdentity } from "@/lib/builder-league/membership";

let local: LocalD1;
const DAY = 86_400_000;

beforeAll(async () => {
  local = await createLocalD1();
  await local.db.insert(users).values([
    { id: "admin", name: "Admin", email: "admin@example.com", emailVerified: true, role: "admin" },
    { id: "pilot", name: "Pilot", email: "pilot@example.com", emailVerified: true },
    { id: "paid", name: "Paid", email: "Paid@Example.com", emailVerified: true },
    { id: "vip", name: "Vip", email: "vip@example.com", emailVerified: true },
    { id: "free-pilot", name: "Free pilot", email: "free@example.com", emailVerified: true },
    { id: "unlinked", name: "Unlinked", email: "unlinked@example.com", emailVerified: true },
    { id: "lapsed", name: "Lapsed", email: "lapsed@example.com", emailVerified: true },
  ]);
  const subscribe = async (email: string, product: string, status: string, end: Date | null, userId: string | null) => {
    const id = crypto.randomUUID();
    await local.db.insert(customers).values({ id, email, userId });
    await local.db.insert(subscriptions).values({
      customerId: id,
      polarSubscriptionId: `sub_${email}`,
      polarProductId: product,
      productName: product,
      status,
      currentPeriodEnd: end,
    });
  };
  const future = new Date(Date.now() + 30 * DAY);
  await subscribe("pilot@example.com", "prod_premium", "active", future, "pilot");
  await subscribe("paid@example.com", "prod_premium", "trialing", null, "paid");
  await subscribe("vip@example.com", "prod_vip", "active", future, "vip");
  await subscribe("unlinked@example.com", "prod_vip", "active", future, null);
  await subscribe("lapsed@example.com", "prod_premium", "canceled", new Date(Date.now() - DAY), "lapsed");
  await local.db.insert(communityConnections).values({ userId: "pilot", provider: "discord", externalUserId: "123456789", displayName: "pilot#1" });
  await local.db.insert(builderPilotMembers).values([
    { userId: "pilot", addedBy: "admin" },
    { userId: "free-pilot", addedBy: "admin" },
  ]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await local.dispose();
});

beforeEach(() => {
  resolveCallerMock.mockReset();
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
});

const viewer = (id: string, role = "user") => ({ id, role });
const caller = (id: string, authType: ResolvedCaller["authType"] = "session", role = "user"): ResolvedCaller => ({
  user: { id, name: id, email: `${id}@example.com`, role, emailVerified: true },
  authType,
});
const request = (method = "GET") => new Request("https://example.test/api/v1/builder-me", { method });

describe("community tier", () => {
  it("reads the effective tier of the customer linked to the user", async () => {
    expect(await getCommunityTier(local.db, "pilot")).toBe("premium");
    expect(await getCommunityTier(local.db, "paid")).toBe("premium");
    expect(await getCommunityTier(local.db, "vip")).toBe("vip");
    expect(await getCommunityTier(local.db, "free-pilot")).toBe("none");
    expect(await getCommunityTier(local.db, "unlinked")).toBe("none");
    expect(await getCommunityTier(local.db, "lapsed")).toBe("none");
    expect(await getCommunityTier(local.db, "missing")).toBe("none");
  });

  it("reads the linked Discord identity from community connections", async () => {
    expect(await getDiscordIdentity(local.db, "pilot")).toMatchObject({ externalUserId: "123456789", username: "pilot#1" });
    expect(await getDiscordIdentity(local.db, "paid")).toBeNull();
  });
});

describe("builder league access", () => {
  it("lets only admins and paid pilot members in while the flag is off", async () => {
    expect(isBuilderLeagueEnabled()).toBe(false);
    expect(await getViewerAccess(local.db, viewer("admin", "admin"))).toMatchObject({ canUse: true, isAdmin: true });
    expect(await getViewerAccess(local.db, viewer("pilot"))).toMatchObject({ canUse: true, isPilot: true, tier: "premium" });
    expect(await getViewerAccess(local.db, viewer("paid"))).toMatchObject({ canUse: false, tier: "premium" });
    expect(await getViewerAccess(local.db, viewer("free-pilot"))).toMatchObject({ canUse: false, isPilot: true, tier: "none" });
    expect(await getViewerAccess(local.db, null)).toMatchObject({ canUse: false, flagEnabled: false });
  });

  it("opens to every paid member when the flag is on", async () => {
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    expect(isBuilderLeagueEnabled()).toBe(true);
    expect(await getViewerAccess(local.db, viewer("paid"))).toMatchObject({ canUse: true, flagEnabled: true });
    expect(await getViewerAccess(local.db, viewer("vip"))).toMatchObject({ canUse: true, tier: "vip" });
    expect(await getViewerAccess(local.db, viewer("free-pilot"))).toMatchObject({ canUse: false });
  });

  it("hides the feature with 404 while the flag is off", async () => {
    resolveCallerMock.mockResolvedValue(null);
    await expect(requireBuilderLeagueUser(request(), "builder:read", local.db)).rejects.toMatchObject({ status: 404 });
    resolveCallerMock.mockResolvedValue(caller("paid"));
    await expect(requireBuilderLeagueUser(request(), "builder:read", local.db)).rejects.toMatchObject({ status: 404 });
    resolveCallerMock.mockResolvedValue(caller("pilot"));
    await expect(requireBuilderLeagueUser(request(), "builder:read", local.db)).resolves.toMatchObject({ actorRole: "member" });
  });

  it("answers 401 and 403 when the flag is on and maps API keys and agents to submit-only roles", async () => {
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    resolveCallerMock.mockResolvedValue(null);
    await expect(requireBuilderLeagueUser(request(), "builder:read", local.db)).rejects.toMatchObject({ status: 401 });
    resolveCallerMock.mockResolvedValue(caller("free-pilot"));
    await expect(requireBuilderLeagueUser(request(), "builder:read", local.db)).rejects.toMatchObject({ status: 403 });
    resolveCallerMock.mockResolvedValue(caller("paid", "api_key"));
    await expect(requireBuilderLeagueUser(request("POST"), "builder:write", local.db)).resolves.toMatchObject({ actorRole: "api" });
    resolveCallerMock.mockResolvedValue(caller("vip", "delegation"));
    await expect(requireBuilderLeagueUser(request(), "builder:read", local.db)).resolves.toMatchObject({ actorRole: "agent" });
  });

  it("requires an admin session for admin routes", async () => {
    resolveCallerMock.mockResolvedValue(caller("admin", "session", "admin"));
    await expect(requireBuilderLeagueAdmin(request(), local.db)).resolves.toMatchObject({ actorRole: "admin" });
    resolveCallerMock.mockResolvedValue(caller("admin", "api_key", "admin"));
    await expect(requireBuilderLeagueAdmin(request(), local.db)).rejects.toMatchObject({ status: 403, code: "session_required" });
    resolveCallerMock.mockResolvedValue(caller("pilot"));
    await expect(requireBuilderLeagueAdmin(request(), local.db)).rejects.toMatchObject({ status: 404 });
  });
});
