import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityAccessState, customers, onboardingJobs, subscriptions, users } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import { applySubscriptionSnapshot, markSubscriptionRefunded, type PolarSubscriptionSnapshot } from "@/lib/membership/subscription-sync";
import {
  findLinkableCustomerForUser,
  findVerifiedUserIdByEmail,
  getMemberTier,
  linkCustomerToUser,
} from "@/lib/membership/member-access";
import { enqueueTierDrift, resyncMembershipSubscriptions, type PolarSubscriptionReader } from "@/lib/membership/polar-resync";
import { reconcileCommunityAccess } from "@/lib/community/reconcile";
import { discordAdapter } from "@/lib/community/discord-adapter";
import { ProviderError } from "@/lib/community/types";

const sendWelcomeEmailMock = vi.fn().mockResolvedValue({ success: true, data: { id: "msg_welcome" } });
const sendForm01EmailMock = vi.fn().mockResolvedValue({ success: true, data: { id: "msg_form01" } });

vi.mock("@/lib/resend", () => ({
  sendWelcomeEmail: (...args: unknown[]) => sendWelcomeEmailMock(...args),
  resend: { emails: { send: vi.fn() } },
}));
vi.mock("@/lib/email-form01", () => ({
  sendForm01Email: (...args: unknown[]) => sendForm01EmailMock(...args),
}));
vi.mock("@/lib/discord", () => ({
  sendDiscordSalesNotification: vi.fn().mockResolvedValue(true),
}));
vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: vi.fn().mockReturnValue(true),
  WebhookVerificationError: class WebhookVerificationError extends Error {},
}));

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-17T00:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

async function createUser({ verified = true, email }: { verified?: boolean; email?: string } = {}) {
  const id = nextId("member-user");
  await getDb().insert(users).values({ id, name: id, email: email ?? `${id}@example.com`, emailVerified: verified });
  return id;
}

async function createCustomer(userId: string | null = null, email = `${nextId("buyer")}@example.com`) {
  const [row] = await getDb().insert(customers).values({ email, name: "Buyer", userId }).returning();
  return row;
}

function snapshot(customerId: string, overrides: Partial<PolarSubscriptionSnapshot> = {}): PolarSubscriptionSnapshot {
  return {
    polarSubscriptionId: nextId("sub"),
    customerId,
    productId: PRODUCT_IDS.PREMIUM_ANNUAL,
    productName: "Premium Annual",
    status: "active",
    currentPeriodStart: T0,
    currentPeriodEnd: after(365 * DAY),
    cancelAtPeriodEnd: false,
    endedAt: null,
    modifiedAt: T0,
    ...overrides,
  };
}

async function subscriptionRow(polarSubscriptionId: string) {
  const [row] = await getDb().select().from(subscriptions).where(eq(subscriptions.polarSubscriptionId, polarSubscriptionId));
  return row;
}

describe("subscription sync ordering", () => {
  it("never lets an older delivery overwrite newer state", async () => {
    const customer = await createCustomer();
    const newer = snapshot(customer.id, { status: "past_due", modifiedAt: after(2000) });
    await applySubscriptionSnapshot(getDb(), newer, after(2000));
    const result = await applySubscriptionSnapshot(getDb(), { ...newer, status: "active", modifiedAt: after(1000) }, after(3000));
    expect(result.changed).toBe(false);
    expect(await subscriptionRow(newer.polarSubscriptionId)).toMatchObject({ status: "past_due", pastDueSince: after(2000) });
  });

  it("keeps past_due_since from the first past_due delivery and clears it on recovery", async () => {
    const customer = await createCustomer();
    const sub = snapshot(customer.id, { status: "past_due", modifiedAt: after(1000) });
    await applySubscriptionSnapshot(getDb(), sub);
    await applySubscriptionSnapshot(getDb(), { ...sub, modifiedAt: after(5000) });
    expect((await subscriptionRow(sub.polarSubscriptionId)).pastDueSince).toEqual(after(1000));
    const recovered = await applySubscriptionSnapshot(getDb(), { ...sub, status: "active", modifiedAt: after(9000) });
    expect(recovered.changed).toBe(true);
    expect(recovered.row).toMatchObject({ status: "active", pastDueSince: null });
  });

  it("prefers the later lifecycle stage for equal timestamps and treats ended as terminal", async () => {
    const customer = await createCustomer();
    const sub = snapshot(customer.id, { status: "canceled", cancelAtPeriodEnd: true, modifiedAt: after(1000) });
    await applySubscriptionSnapshot(getDb(), sub);
    await applySubscriptionSnapshot(getDb(), { ...sub, status: "active", cancelAtPeriodEnd: false });
    expect((await subscriptionRow(sub.polarSubscriptionId)).status).toBe("canceled");

    await applySubscriptionSnapshot(getDb(), { ...sub, endedAt: after(2000), modifiedAt: after(2000) });
    await applySubscriptionSnapshot(getDb(), { ...sub, status: "active", endedAt: null, modifiedAt: after(9000) });
    expect(await subscriptionRow(sub.polarSubscriptionId)).toMatchObject({ status: "canceled", endedAt: after(2000) });
  });

  it("follows upgrades to another product and keeps a refund terminal against later deliveries", async () => {
    const customer = await createCustomer();
    const sub = snapshot(customer.id);
    await applySubscriptionSnapshot(getDb(), sub);
    const upgraded = await applySubscriptionSnapshot(getDb(), { ...sub, productId: PRODUCT_IDS.VIP_ANNUAL, productName: null, modifiedAt: after(1000) });
    expect(upgraded.changed).toBe(true);
    expect(upgraded.row).toMatchObject({ polarProductId: PRODUCT_IDS.VIP_ANNUAL, productName: "Premium Annual" });

    await markSubscriptionRefunded(getDb(), sub.polarSubscriptionId, after(2000));
    await applySubscriptionSnapshot(getDb(), { ...sub, status: "active", modifiedAt: after(3000) });
    expect(await subscriptionRow(sub.polarSubscriptionId)).toMatchObject({ status: "refunded", endedAt: after(2000) });
    expect(await markSubscriptionRefunded(getDb(), "sub-unknown", after(1))).toBeNull();
  });
});

describe("customer linking and member tier", () => {
  it("links only by verified, trimmed, lowercased email and never steals a link", async () => {
    const userId = await createUser({ email: "Jane.Doe@Example.com" });
    const unverified = await createUser({ verified: false, email: "unverified@example.com" });
    expect(await findVerifiedUserIdByEmail(getDb(), "  jane.doe@example.COM ")).toBe(userId);
    expect(await findVerifiedUserIdByEmail(getDb(), "janedoe@example.com")).toBeNull();
    expect(await findVerifiedUserIdByEmail(getDb(), "jane.doe+x@example.com")).toBeNull();
    expect(await findVerifiedUserIdByEmail(getDb(), "unverified@example.com")).toBeNull();

    const customer = await createCustomer(null, "jane.doe@example.com");
    expect(await findLinkableCustomerForUser(getDb(), { id: userId, email: "Jane.Doe@Example.com", emailVerified: true })).toMatchObject({ id: customer.id });
    expect(await findLinkableCustomerForUser(getDb(), { id: userId, email: "Jane.Doe@Example.com", emailVerified: false })).toBeNull();

    expect(await linkCustomerToUser(getDb(), { customerId: customer.id, userId })).toBe(true);
    expect(await linkCustomerToUser(getDb(), { customerId: customer.id, userId: unverified })).toBe(false);
    // The user already owns a customer: a second one is not linked.
    const second = await createCustomer();
    expect(await linkCustomerToUser(getDb(), { customerId: second.id, userId })).toBe(false);
  });

  it("derives the tier only from customers linked through NLB", async () => {
    const userId = await createUser();
    const unlinked = await createCustomer();
    await applySubscriptionSnapshot(getDb(), snapshot(unlinked.id, { productId: PRODUCT_IDS.VIP_ANNUAL }));
    expect((await getMemberTier(getDb(), userId, T0)).tier).toBe("none");

    await linkCustomerToUser(getDb(), { customerId: unlinked.id, userId });
    expect((await getMemberTier(getDb(), userId, T0)).tier).toBe("vip");
  });
});

describe("community access reconcile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records the stub outcome with the resolved desired tier", async () => {
    const userId = await createUser();
    const customer = await createCustomer(userId);
    await applySubscriptionSnapshot(getDb(), snapshot(customer.id));
    expect(await reconcileCommunityAccess(getDb(), userId, "discord_guild", T0)).toMatchObject({
      desiredTier: "premium",
      status: "not_connected",
      appliedTier: "none",
    });
  });

  it("records retryable adapter failures as retrying and rethrows for backoff", async () => {
    const userId = await createUser();
    vi.spyOn(discordAdapter, "apply").mockRejectedValueOnce(new Error("socket hang up"));
    await expect(reconcileCommunityAccess(getDb(), userId, "discord_guild", T0)).rejects.toMatchObject({
      code: "adapter_error",
      retryable: true,
    });
    const [state] = await getDb()
      .select()
      .from(communityAccessState)
      .where(and(eq(communityAccessState.userId, userId), eq(communityAccessState.target, "discord_guild")));
    expect(state).toMatchObject({ status: "retrying", errorCode: "adapter_error" });

    vi.spyOn(discordAdapter, "apply").mockRejectedValueOnce(new ProviderError("missing_permissions"));
    expect(await reconcileCommunityAccess(getDb(), userId, "discord_guild", T0)).toMatchObject({
      status: "action_required",
      errorCode: "missing_permissions",
    });
  });
});

describe("Polar resync", () => {
  // The resync and drift scan walk every row, so start from an empty slate.
  beforeEach(async () => {
    await getDb().delete(onboardingJobs);
    await getDb().delete(communityAccessState);
    await getDb().delete(subscriptions);
  });

  it("applies live Polar state, queues reconciles for linked users and counts failures", async () => {
    const userId = await createUser();
    const linked = await createCustomer(userId);
    const live = snapshot(linked.id, { modifiedAt: after(-DAY) });
    await applySubscriptionSnapshot(getDb(), live);
    const broken = snapshot((await createCustomer()).id, { modifiedAt: after(-DAY) });
    await applySubscriptionSnapshot(getDb(), broken);

    const client: PolarSubscriptionReader = {
      subscriptions: {
        get: vi.fn(async ({ id }: { id: string }) => {
          if (id === broken.polarSubscriptionId) throw new Error("404");
          return { id, status: "canceled", productId: PRODUCT_IDS.PREMIUM_ANNUAL, endedAt: T0, modifiedAt: T0, cancelAtPeriodEnd: false };
        }),
      },
    };
    const summary = await resyncMembershipSubscriptions(getDb(), client, { now: T0 });
    expect(summary).toMatchObject({ changed: 1, failed: 1 });
    expect(await subscriptionRow(live.polarSubscriptionId)).toMatchObject({ status: "canceled", endedAt: T0 });
    const jobs = await getDb().select().from(onboardingJobs);
    expect(jobs.map((job) => job.dedupeKey).sort()).toEqual([
      `reconcile_access:${userId}:discord_guild`,
      `reconcile_access:${userId}:telegram_group`,
    ]);
  });

  it("queues reconciles when time alone changes the tier", async () => {
    const userId = await createUser();
    const customer = await createCustomer(userId);
    await applySubscriptionSnapshot(getDb(), snapshot(customer.id, { cancelAtPeriodEnd: true, currentPeriodEnd: after(DAY) }));
    await reconcileCommunityAccess(getDb(), userId, "discord_guild", T0);
    expect(await enqueueTierDrift(getDb(), T0)).toBe(0);
    expect(await enqueueTierDrift(getDb(), after(DAY))).toBe(1);
  });
});

describe("Polar webhook with onboarding v2 on", () => {
  beforeEach(async () => {
    vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
    vi.clearAllMocks();
    await getDb().delete(onboardingJobs);
  });
  afterEach(() => vi.unstubAllEnvs());

  async function deliver(type: string, data: Record<string, unknown>, webhookId = nextId("wh")) {
    const { POST } = await import("@/app/api/webhooks/polar/route");
    const response = await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: { "webhook-id": webhookId, "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
        body: JSON.stringify({ type, data }),
      })
    );
    expect(response.status).toBe(200);
    return response;
  }

  const jobKeys = async () => (await getDb().select().from(onboardingJobs)).map((job) => job.dedupeKey).sort();

  function subscriptionData(overrides: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    return {
      id: nextId("sub_polar"),
      status: "active",
      customer_email: `${nextId("buyer")}@example.com`,
      customer_name: "Buyer",
      product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      started_at: now,
      created_at: now,
      modified_at: now,
      ...overrides,
    };
  }

  it("links by verified email, queues welcome, admin ping and both reconciles, and never sends Form 01", async () => {
    const email = `${nextId("verified")}@example.com`;
    const userId = await createUser({ email });
    const data = subscriptionData({ customer_email: ` ${email.toUpperCase()} ` });
    await deliver("subscription.created", data);

    expect(sendWelcomeEmailMock).not.toHaveBeenCalled();
    expect(sendForm01EmailMock).not.toHaveBeenCalled();
    const [customer] = await getDb().select().from(customers).where(eq(customers.email, email));
    expect(customer.userId).toBe(userId);
    expect(await jobKeys()).toEqual([
      `admin_notify:new_membership:${data.id}`,
      `reconcile_access:${userId}:discord_guild`,
      `reconcile_access:${userId}:telegram_group`,
      `welcome_email:${data.id}`,
    ]);
    const [welcome] = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.kind, "welcome_email"));
    expect(welcome.payload).toEqual({ customerId: customer.id, subscriptionId: data.id, locale: null });

    // A replayed delivery under a new webhook id does not queue a second welcome.
    await getDb().delete(onboardingJobs).where(eq(onboardingJobs.kind, "reconcile_access"));
    await deliver("subscription.active", data);
    expect((await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.kind, "welcome_email")))).toHaveLength(1);
  });

  it("links an unverified buyer through checkout metadata and keeps the buyer locale", async () => {
    const userId = await createUser({ verified: false });
    const data = subscriptionData({ metadata: { nlb_user_id: userId, nlb_locale: "vi" } });
    await deliver("subscription.created", data);
    const [customer] = await getDb().select().from(customers).where(eq(customers.email, data.customer_email as string));
    expect(customer.userId).toBe(userId);
    const [welcome] = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.kind, "welcome_email"));
    expect(welcome.payload).toMatchObject({ locale: "vi" });
  });

  it("links through nlb_user_id on checkout and order payloads and ignores Polar external ids", async () => {
    const fromCheckout = await createUser({ verified: false });
    const checkoutEmail = `${nextId("checkout")}@example.com`;
    await deliver("checkout.updated", {
      id: nextId("chk"),
      status: "succeeded",
      customer_email: checkoutEmail,
      product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      metadata: { nlb_user_id: fromCheckout },
    });
    const [checkoutCustomer] = await getDb().select().from(customers).where(eq(customers.email, checkoutEmail));
    expect(checkoutCustomer.userId).toBe(fromCheckout);

    const fromOrder = await createUser({ verified: false });
    const orderEmail = `${nextId("order")}@example.com`;
    await deliver("order.paid", {
      id: nextId("ord"),
      status: "paid",
      paid: true,
      customer_email: orderEmail,
      product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      amount: 46800,
      metadata: { nlb_user_id: fromOrder },
    });
    const [orderCustomer] = await getDb().select().from(customers).where(eq(customers.email, orderEmail));
    expect(orderCustomer.userId).toBe(fromOrder);
    expect(await jobKeys()).toEqual([
      `reconcile_access:${fromOrder}:discord_guild`,
      `reconcile_access:${fromOrder}:telegram_group`,
    ]);

    const external = await createUser({ verified: false });
    const data = subscriptionData({ customer_external_id: external, customer: { external_id: external } });
    await deliver("subscription.created", data);
    const [externalCustomer] = await getDb().select().from(customers).where(eq(customers.email, data.customer_email as string));
    expect(externalCustomer.userId).toBeNull();
  });

  it("does not link an unverified email match and skips the welcome for old subscriptions", async () => {
    const email = `${nextId("unverified")}@example.com`;
    await createUser({ verified: false, email });
    const old = new Date(Date.now() - 30 * DAY).toISOString();
    await deliver("subscription.updated", subscriptionData({ customer_email: email, started_at: old, created_at: old }));
    const [customer] = await getDb().select().from(customers).where(eq(customers.email, email));
    expect(customer.userId).toBeNull();
    expect(await jobKeys()).toEqual([]);
  });

  it("tracks past_due, revocation and refunds, queueing reconciles each time", async () => {
    const email = `${nextId("member")}@example.com`;
    const userId = await createUser({ email });
    const base = subscriptionData({ customer_email: email });
    await deliver("subscription.created", base);
    await getDb().delete(onboardingJobs);

    const pastDueAt = new Date(Date.now() + 1000).toISOString();
    await deliver("subscription.past_due", { ...base, status: "past_due", modified_at: pastDueAt });
    expect(await subscriptionRow(base.id)).toMatchObject({ status: "past_due", pastDueSince: new Date(pastDueAt) });
    expect((await getMemberTier(getDb(), userId)).reason).toBe("past_due_grace");
    expect(await jobKeys()).toContain(`reconcile_access:${userId}:discord_guild`);

    // A delayed older `active` delivery is ignored.
    await deliver("subscription.updated", { ...base, status: "active" });
    expect((await subscriptionRow(base.id)).status).toBe("past_due");

    await deliver("order.refunded", {
      id: nextId("ord"),
      status: "refunded",
      subscription_id: base.id,
      product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      modified_at: new Date(Date.now() + 2000).toISOString(),
    });
    expect(await subscriptionRow(base.id)).toMatchObject({ status: "refunded" });
    expect((await getMemberTier(getDb(), userId)).tier).toBe("none");

    const revoked = subscriptionData({ customer_email: email });
    await deliver("subscription.created", revoked);
    const endedAt = new Date(Date.now() + 3000).toISOString();
    await deliver("subscription.revoked", { ...revoked, status: "canceled", ended_at: endedAt, modified_at: endedAt });
    expect(await subscriptionRow(revoked.id)).toMatchObject({ status: "canceled", endedAt: new Date(endedAt) });
  });

  it("ignores subscriptions for products that are not ours", async () => {
    const data = subscriptionData({ product_id: "not-a-membership-product" });
    const response = await deliver("subscription.created", data);
    expect(await response.json()).toMatchObject({ skipped: true });
    expect(await jobKeys()).toEqual([]);
  });
});
