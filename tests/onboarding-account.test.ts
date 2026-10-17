import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityConnections, customers, subscriptions } from "@/lib/db/schema";
import {
  getOnboardingStatus,
  needsOnboardingBanner,
  saveOnboardingProfile,
  type OnboardingStatus,
} from "@/lib/onboarding/status";
import { PRODUCT_IDS } from "@/lib/polar";
import { createMember, createTestUser, nextId, type TestUser } from "./helpers/onboarding-fixtures";

let user: TestUser;

beforeEach(async () => {
  user = await createTestUser();
});

async function linkBoth() {
  for (const provider of ["discord", "telegram"] as const) {
    await getDb().insert(communityConnections).values({ userId: user.id, provider, externalUserId: nextId(provider) });
  }
}

describe("account membership banner", () => {
  it("is hidden without a membership", async () => {
    const status = await getOnboardingStatus(getDb(), user);
    expect(status.membership).toBeNull();
    expect(needsOnboardingBanner(status)).toBe(false);
  });

  it("is shown to existing members who have not finished, and hidden once everything is linked", async () => {
    await createMember(user);
    expect(needsOnboardingBanner(await getOnboardingStatus(getDb(), user))).toBe(true);

    await saveOnboardingProfile(getDb(), user.id, { goal: "Ship", profileLinks: [], skills: null, phone: null, commitmentAccepted: true });
    expect(needsOnboardingBanner(await getOnboardingStatus(getDb(), user))).toBe(true);

    await linkBoth();
    const status: OnboardingStatus = await getOnboardingStatus(getDb(), user);
    expect(status.connections.discord.nextAction).not.toBe("connect");
    expect(needsOnboardingBanner(status)).toBe(false);
  });
});

describe("self-serve claiming on the account page", () => {
  it("links the Polar customer that matches the verified email", async () => {
    const [customer] = await getDb().insert(customers).values({ email: user.email, name: "Paid before signup" }).returning();
    await getDb().insert(subscriptions).values({
      customerId: customer.id,
      polarSubscriptionId: nextId("sub"),
      polarProductId: PRODUCT_IDS.VIP_ANNUAL,
      productName: "VIP Annual",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
    });

    const status = await getOnboardingStatus(getDb(), user);
    expect(status.membership).toMatchObject({ tier: "vip", term: "annual", plan: "VIP Annual" });
    const [linked] = await getDb().select().from(customers).where(eq(customers.id, customer.id));
    expect(linked.userId).toBe(user.id);
  });

  it("does not claim a customer for an unverified email", async () => {
    const unverified = await createTestUser({ verified: false });
    const [customer] = await getDb().insert(customers).values({ email: unverified.email, name: "x" }).returning();
    await getOnboardingStatus(getDb(), unverified);
    const [row] = await getDb().select().from(customers).where(eq(customers.id, customer.id));
    expect(row.userId).toBeNull();
  });
});
