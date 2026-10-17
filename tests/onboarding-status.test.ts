import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, onboardingJobs, subscriptions } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import { checkoutBelongsTo, nextActionFor, termForProductId } from "@/lib/onboarding/status";
import { createMember, createTestUser, nextId, sessionFor, type TestUser } from "./helpers/onboarding-fixtures";

const getSessionMock = vi.fn();
const checkoutGetMock = vi.fn();
const subscriptionGetMock = vi.fn();

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    checkouts = { get: (...args: unknown[]) => checkoutGetMock(...args), create: vi.fn() };
    subscriptions = { get: (...args: unknown[]) => subscriptionGetMock(...args) };
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

const DAY = 24 * 60 * 60 * 1000;

async function getStatus(query = "") {
  const { GET } = await import("@/app/api/onboarding/status/route");
  return GET(new Request(`https://nextlevelbuilder.io/api/onboarding/status${query}`));
}

function polarCheckout(overrides: Record<string, unknown> = {}) {
  return {
    id: "chk_1",
    status: "succeeded",
    customerId: nextId("polar-cus"),
    customerEmail: "someone@example.com",
    customerName: "Buyer",
    subscriptionId: nextId("polar-sub"),
    metadata: {},
    ...overrides,
  };
}

function polarSubscription(id: string, productId: string = PRODUCT_IDS.VIP_QUARTERLY) {
  return {
    id,
    status: "active",
    productId,
    product: { name: "VIP Quarterly" },
    currentPeriodStart: new Date(Date.now() - DAY),
    currentPeriodEnd: new Date(Date.now() + 90 * DAY),
    cancelAtPeriodEnd: false,
    endedAt: null,
    modifiedAt: new Date(),
  };
}

async function reconcileJobsFor(userId: string) {
  const jobs = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.kind, "reconcile_access"));
  return jobs.filter((job) => job.payload.userId === userId).map((job) => job.payload.target);
}

let user: TestUser;

beforeEach(async () => {
  vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
  getSessionMock.mockReset();
  checkoutGetMock.mockReset();
  subscriptionGetMock.mockReset().mockImplementation(({ id }: { id: string }) => Promise.resolve(polarSubscription(id)));
  user = await createTestUser({ email: `${nextId("buyer")}@Example.com` });
  getSessionMock.mockResolvedValue(sessionFor(user));
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/onboarding/status access", () => {
  it("requires a session", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await getStatus("?checkout_id=chk_1");
    expect(response.status).toBe(401);
    expect(checkoutGetMock).not.toHaveBeenCalled();
  });

  it("is not found while the flag is off", async () => {
    vi.stubEnv("ONBOARDING_V2_ENABLED", "false");
    expect((await getStatus()).status).toBe(404);
  });
});

describe("checkout ownership matrix", () => {
  it("binds a checkout whose customer email equals the verified session email (trim + lowercase)", async () => {
    checkoutGetMock.mockResolvedValue(polarCheckout({ customerEmail: `  ${user.email.toUpperCase()} ` }));
    const body = await (await getStatus("?checkout_id=chk_email")).json();

    expect(body.payment).toBe("verified");
    expect(body.membership).toMatchObject({ tier: "vip", term: "quarterly", status: "active", cancelAtPeriodEnd: false });
    expect(body.connections.discord).toEqual({ status: "not_connected", nextAction: "connect" });
    expect(body.connections.telegram.nextAction).toBe("connect");
    expect(await reconcileJobsFor(user.id)).toEqual(expect.arrayContaining(["discord_guild", "telegram_group"]));
  });

  it("binds a checkout whose metadata names the session user even with another email", async () => {
    checkoutGetMock.mockResolvedValue(polarCheckout({ customerEmail: "other-address@example.com", metadata: { nlb_user_id: user.id } }));
    const body = await (await getStatus("?checkout_id=chk_meta")).json();
    expect(body.payment).toBe("verified");
    const [linked] = await getDb().select().from(customers).where(eq(customers.userId, user.id));
    expect(linked.email).toBe("other-address@example.com");
  });

  it("does not take over an existing customer with its own membership through metadata alone", async () => {
    const victimEmail = `${nextId("victim")}@example.com`;
    const [victim] = await getDb().insert(customers).values({ email: victimEmail, name: "Victim" }).returning();
    await getDb().insert(subscriptions).values({
      customerId: victim.id,
      polarSubscriptionId: nextId("victim-sub"),
      polarProductId: PRODUCT_IDS.VIP_ANNUAL,
      productName: "VIP",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 90 * DAY),
    });
    checkoutGetMock.mockResolvedValue(polarCheckout({ customerId: null, customerEmail: victimEmail, metadata: { nlb_user_id: user.id } }));

    const body = await (await getStatus("?checkout_id=chk_takeover")).json();
    expect(body.payment).toBe("not_owner");
    expect(body.membership).toBeNull();
    const [row] = await getDb().select().from(customers).where(eq(customers.id, victim.id));
    expect(row.userId).toBeNull();
    expect(await reconcileJobsFor(user.id)).toEqual([]);
  });

  it("never binds a checkout paid with another user's verified email to the payer", async () => {
    const owner = await createTestUser();
    checkoutGetMock.mockResolvedValue(polarCheckout({ customerEmail: owner.email, metadata: { nlb_user_id: user.id } }));
    const body = await (await getStatus("?checkout_id=chk_other_verified")).json();
    expect(body.payment).toBe("not_owner");
    expect(body.membership).toBeNull();
    const [row] = await getDb().select().from(customers).where(eq(customers.email, owner.email));
    expect(row.userId).toBe(owner.id);
    expect(await reconcileJobsFor(user.id)).toEqual([]);
  });

  it("binds a second customer for a user who already owns one", async () => {
    await createMember(user, { productId: PRODUCT_IDS.PREMIUM_ANNUAL, status: "canceled" });
    checkoutGetMock.mockResolvedValue(polarCheckout({ customerEmail: "work-address@example.com", metadata: { nlb_user_id: user.id } }));
    const body = await (await getStatus("?checkout_id=chk_second")).json();
    expect(body.payment).toBe("verified");
    expect(await getDb().select().from(customers).where(eq(customers.userId, user.id))).toHaveLength(2);
  });

  it("reports not_owner and binds nothing when neither email nor metadata match", async () => {
    checkoutGetMock.mockResolvedValue(polarCheckout({ customerEmail: "victim@example.com", metadata: { nlb_user_id: "someone-else" } }));
    const body = await (await getStatus("?checkout_id=chk_other")).json();
    expect(body.payment).toBe("not_owner");
    expect(body.membership).toBeNull();
    expect(subscriptionGetMock).not.toHaveBeenCalled();
    expect(await getDb().select().from(customers).where(eq(customers.userId, user.id))).toHaveLength(0);
    expect(await reconcileJobsFor(user.id)).toEqual([]);
  });

  it("never binds by email when the session email is unverified", async () => {
    const unverified = await createTestUser({ verified: false });
    getSessionMock.mockResolvedValue(sessionFor(unverified));
    checkoutGetMock.mockResolvedValue(polarCheckout({ customerEmail: unverified.email }));
    expect((await (await getStatus("?checkout_id=chk_unverified")).json()).payment).toBe("not_owner");
  });

  it("maps open, failed and unreachable checkouts without binding", async () => {
    checkoutGetMock.mockResolvedValueOnce(polarCheckout({ status: "open", customerEmail: user.email }));
    expect((await (await getStatus("?checkout_id=chk_open")).json()).payment).toBe("pending");
    checkoutGetMock.mockResolvedValueOnce(polarCheckout({ status: "failed", customerEmail: user.email }));
    expect((await (await getStatus("?checkout_id=chk_failed")).json()).payment).toBe("failed");
    checkoutGetMock.mockRejectedValueOnce(new Error("polar down"));
    expect((await (await getStatus("?checkout_id=chk_down")).json()).payment).toBe("verifying");
  });

  it("ignores malformed checkout ids and reports no payment", async () => {
    const body = await (await getStatus("?checkout_id=../../etc")).json();
    expect(body.payment).toBe("none");
    expect(checkoutGetMock).not.toHaveBeenCalled();
  });
});

describe("existing webhook data", () => {
  it("claims the unlinked customer matching the verified email and queues access, without calling Polar", async () => {
    const [customer] = await getDb()
      .insert(customers)
      .values({ email: user.email.toLowerCase(), name: "Existing" })
      .returning();
    const { subscriptions } = await import("@/lib/db/schema");
    await getDb().insert(subscriptions).values({
      customerId: customer.id,
      polarSubscriptionId: nextId("sub"),
      polarProductId: PRODUCT_IDS.PREMIUM_QUARTERLY,
      productName: "Premium Quarterly",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * DAY),
    });

    const body = await (await getStatus("?checkout_id=chk_any")).json();
    expect(body.payment).toBe("verified");
    expect(body.membership).toMatchObject({ tier: "premium", term: "quarterly" });
    expect(checkoutGetMock).not.toHaveBeenCalled();
    expect(await reconcileJobsFor(user.id)).toHaveLength(2);
  });

  it("returns the member's own state when a checkout id is present but membership already exists", async () => {
    await createMember(user, { cancelAtPeriodEnd: true });
    const body = await (await getStatus("?checkout_id=chk_someone_elses")).json();
    expect(body.payment).toBe("verified");
    expect(body.membership.cancelAtPeriodEnd).toBe(true);
    expect(body.profile).toEqual({ goal: "", profileLinks: [], skills: "", phone: "", commitmentAccepted: false, completed: false });
  });
});

describe("status helpers", () => {
  it("decides ownership only from verified email or server metadata", () => {
    const owner = { id: "u1", email: "A@B.co", emailVerified: true };
    expect(checkoutBelongsTo({ customerEmail: " a@b.co " }, owner)).toBe(true);
    expect(checkoutBelongsTo({ customerEmail: "a+x@b.co" }, owner)).toBe(false);
    expect(checkoutBelongsTo({ customerEmail: "a@b.co" }, { ...owner, emailVerified: false })).toBe(false);
    expect(checkoutBelongsTo({ customerEmail: "x@y.z", metadata: { nlb_user_id: "u1" } }, owner)).toBe(true);
  });

  it("maps access state to the next action", () => {
    expect(nextActionFor("discord", "none", false, null)).toBe("none");
    expect(nextActionFor("discord", "premium", false, null)).toBe("connect");
    expect(nextActionFor("telegram", "vip", true, "waiting_for_join")).toBe("join");
    expect(nextActionFor("discord", "vip", true, "action_required")).toBe("reconnect");
    expect(nextActionFor("discord", "vip", true, "retrying")).toBe("retry");
    expect(nextActionFor("telegram", "premium", true, "active")).toBe("retry");
    expect(nextActionFor("discord", "vip", true, "processing")).toBe("none");
  });

  it("derives the billing term from the product id", () => {
    expect(termForProductId(PRODUCT_IDS.PREMIUM_QUARTERLY)).toBe("quarterly");
    expect(termForProductId(PRODUCT_IDS.VIP_ANNUAL)).toBe("annual");
  });
});
