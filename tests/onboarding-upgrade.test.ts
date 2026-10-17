import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, onboardingJobs, subscriptions } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import { vipProductForPremium } from "@/lib/onboarding/status";
import { createMember, createTestUser, nextId, sessionFor, type TestUser } from "./helpers/onboarding-fixtures";

const getSessionMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    checkouts = { get: vi.fn(), create: vi.fn() };
    subscriptions = { get: vi.fn(), update: (...args: unknown[]) => updateMock(...args) };
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

const DAY = 24 * 60 * 60 * 1000;

async function postUpgrade() {
  const { POST } = await import("@/app/api/onboarding/upgrade/route");
  return POST(new Request("https://nextlevelbuilder.io/api/onboarding/upgrade", { method: "POST" }));
}

async function subscriptionRows(customerId: string) {
  return getDb().select().from(subscriptions).where(eq(subscriptions.customerId, customerId));
}

async function reconcileTargets(userId: string) {
  const jobs = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.kind, "reconcile_access"));
  return jobs.filter((job) => job.payload.userId === userId).map((job) => job.payload.target).sort();
}

let user: TestUser;

beforeEach(async () => {
  vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
  getSessionMock.mockReset();
  updateMock.mockReset().mockImplementation(
    async ({ id, subscriptionUpdate }: { id: string; subscriptionUpdate: { productId: string } }) => ({
      id,
      status: "active",
      productId: subscriptionUpdate.productId,
      product: { name: "VIP" },
      currentPeriodStart: new Date(Date.now() - DAY),
      currentPeriodEnd: new Date(Date.now() + 90 * DAY),
      cancelAtPeriodEnd: false,
      endedAt: null,
      modifiedAt: new Date(Date.now() + 1000),
    })
  );
  user = await createTestUser();
  getSessionMock.mockResolvedValue(sessionFor(user));
});

afterEach(() => vi.unstubAllEnvs());

describe("VIP product mapping", () => {
  it("keeps the billing cycle", () => {
    expect(vipProductForPremium(PRODUCT_IDS.PREMIUM_QUARTERLY)).toBe(PRODUCT_IDS.VIP_QUARTERLY);
    expect(vipProductForPremium(PRODUCT_IDS.PREMIUM_ANNUAL)).toBe(PRODUCT_IDS.VIP_ANNUAL);
    expect(vipProductForPremium("legacy-early-bird-annual")).toBe(PRODUCT_IDS.VIP_ANNUAL);
  });
});

describe("POST /api/onboarding/upgrade", () => {
  it("is not found while the flag is off and requires a session", async () => {
    vi.stubEnv("ONBOARDING_V2_ENABLED", "false");
    expect((await postUpgrade()).status).toBe(404);
    vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
    getSessionMock.mockResolvedValue(null);
    expect((await postUpgrade()).status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["quarterly", PRODUCT_IDS.PREMIUM_QUARTERLY, PRODUCT_IDS.VIP_QUARTERLY],
    ["annual", PRODUCT_IDS.PREMIUM_ANNUAL, PRODUCT_IDS.VIP_ANNUAL],
  ])("switches a %s Premium subscription in place with invoiced proration", async (_cycle, premium, vip) => {
    const customer = await createMember(user, { productId: premium });
    const [before] = await subscriptionRows(customer.id);

    const response = await postUpgrade();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ upgraded: true, membership: { tier: "vip" } });

    expect(updateMock).toHaveBeenCalledWith({
      id: before.polarSubscriptionId,
      subscriptionUpdate: { productId: vip, prorationBehavior: "invoice" },
    });
    const rows = await subscriptionRows(customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].polarProductId).toBe(vip);
    expect(await reconcileTargets(user.id)).toEqual(["discord_guild", "telegram_group"]);
  });

  it("returns 409 no_membership only when no membership subscription is linked at all", async () => {
    const response = await postUpgrade();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no_membership" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 409 already_vip for a VIP member, even with a separate Premium subscription", async () => {
    await createMember(user, { productId: PRODUCT_IDS.VIP_ANNUAL });
    const [second] = await getDb()
      .insert(customers)
      .values({ email: `${nextId("second")}@example.com`, name: "Member", userId: user.id })
      .returning();
    await getDb().insert(subscriptions).values({
      customerId: second.id,
      polarSubscriptionId: nextId("sub"),
      polarProductId: PRODUCT_IDS.PREMIUM_QUARTERLY,
      productName: "Premium",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 90 * DAY),
    });
    const response = await postUpgrade();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_vip" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 409 past_due for a past-due Premium subscription instead of a new checkout", async () => {
    const customer = await createMember(user, { productId: PRODUCT_IDS.PREMIUM_ANNUAL, status: "past_due" });
    await getDb().update(subscriptions).set({ pastDueSince: new Date() }).where(eq(subscriptions.customerId, customer.id));
    const response = await postUpgrade();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "past_due" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 409 no_upgradeable_subscription when only ended memberships are linked", async () => {
    await createMember(user, { productId: PRODUCT_IDS.PREMIUM_ANNUAL, status: "canceled" });
    const response = await postUpgrade();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no_upgradeable_subscription" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 502 when Polar fails, keeps the Premium row, and rate-limits the next attempt", async () => {
    const customer = await createMember(user, { productId: PRODUCT_IDS.PREMIUM_QUARTERLY });
    updateMock.mockRejectedValueOnce(new Error("polar unavailable"));

    const failed = await postUpgrade();
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "upgrade_failed" });
    expect((await subscriptionRows(customer.id))[0].polarProductId).toBe(PRODUCT_IDS.PREMIUM_QUARTERLY);

    const again = await postUpgrade();
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
