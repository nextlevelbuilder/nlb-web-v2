import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { affiliateAttributions, affiliateConversions } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import { affiliateBalances } from "@/lib/referrals/commission-ledger";
import { seedAffiliateWithLink, seedUser } from "./referral-fixtures";

const createCheckoutMock = vi.fn();
const createDiscountMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    checkouts = { create: (...args: unknown[]) => createCheckoutMock(...args) };
    discounts = { create: (...args: unknown[]) => createDiscountMock(...args) };
  },
}));
vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: vi.fn().mockReturnValue(true),
  WebhookVerificationError: class WebhookVerificationError extends Error {},
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));
vi.mock("@/lib/resend", () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true, data: { id: "m" } }) }));
vi.mock("@/lib/email-form01", () => ({ sendForm01Email: vi.fn().mockResolvedValue({ success: true, data: { id: "m" } }) }));
vi.mock("@/lib/discord", () => ({ sendDiscordSalesNotification: vi.fn().mockResolvedValue(true) }));

async function checkout(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/checkout/route");
  const response = await POST(
    new Request("https://nextlevelbuilder.io/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
  return { status: response.status, body: await response.json(), request: createCheckoutMock.mock.calls.at(-1)?.[0] };
}

let webhookSeq = 0;
async function deliver(type: string, data: Record<string, unknown>) {
  const { POST } = await import("@/app/api/webhooks/polar/route");
  const id = `wh_ref_${++webhookSeq}`;
  const response = await POST(
    new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
      method: "POST",
      headers: { "webhook-id": id, "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
      body: JSON.stringify({ type, id: `evt_${id}`, data }),
    })
  );
  expect(response.status).toBe(200);
}

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
  createCheckoutMock.mockReset().mockResolvedValue({ id: "chk_ref_1", url: "https://polar.test/checkout/chk_ref_1" });
  createDiscountMock.mockReset().mockResolvedValue({ id: "disc_ref_500" });
});
afterEach(() => vi.unstubAllEnvs());

describe("referred membership purchase, end to end", () => {
  it("applies the discount at checkout, accrues on the paid order and reverses on refund", async () => {
    const { affiliate, link } = await seedAffiliateWithLink(500);
    const buyer = await seedUser("e2e-buyer");
    getSessionMock.mockResolvedValue({ user: { id: buyer.id, email: buyer.email } });

    const result = await checkout({ productId: PRODUCT_IDS.PREMIUM_ANNUAL, referralCode: link.code.toUpperCase() });
    expect(result.status).toBe(200);
    expect(result.body.referral).toEqual({ applied: true, code: link.code, discountBps: 500 });
    expect(result.request).toMatchObject({ discountId: "disc_ref_500", allowDiscountCodes: false });
    const attributionId = result.request.metadata.nlb_aff_attr as string;
    expect(result.request.metadata.nlb_user_id).toBe(buyer.id);
    const [binding] = await getDb().select().from(affiliateAttributions).where(eq(affiliateAttributions.id, attributionId));
    expect(binding).toMatchObject({ polarCheckoutId: "chk_ref_1", discountBps: 500, commissionBps: 526 });

    const order = {
      id: "ord_ref_1",
      status: "paid",
      paid: true,
      billing_reason: "subscription_create",
      customer_email: buyer.email,
      product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      product: { id: PRODUCT_IDS.PREMIUM_ANNUAL, name: "Premium Annual" },
      discount_id: "disc_ref_500",
      currency: "usd",
      subtotal_amount: 20_000,
      discount_amount: 1000,
      net_amount: 19_000,
      tax_amount: 0,
      total_amount: 19_000,
      refunded_amount: 0,
      refunded_tax_amount: 0,
      created_at: new Date().toISOString(),
      metadata: { nlb_aff_attr: attributionId, nlb_user_id: buyer.id },
    };
    await deliver("order.created", order);
    await deliver("order.paid", order);
    const [conversion] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.polarOrderId, "ord_ref_1"));
    expect(conversion).toMatchObject({ status: "pending", commissionMinor: 999, holdReason: null });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 999 });

    await deliver("order.refunded", { ...order, status: "refunded", refunded_amount: 19_000 });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 0 });
  });

  it("reports why a typed code did not apply and never blocks the purchase", async () => {
    const { user, link } = await seedAffiliateWithLink(0);
    getSessionMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const self = await checkout({ productId: PRODUCT_IDS.PREMIUM_ANNUAL, referralCode: link.code });
    expect(self.status).toBe(200);
    expect(self.body.referral).toEqual({ applied: false, reason: "self_referral" });
    expect(self.request).not.toHaveProperty("discountId");

    getSessionMock.mockResolvedValue(null);
    const anonymous = await checkout({ productId: PRODUCT_IDS.PREMIUM_ANNUAL, referralCode: link.code });
    expect(anonymous.body.referral).toEqual({ applied: false, reason: "sign_in_required" });
    expect(anonymous.request.metadata).not.toHaveProperty("nlb_aff_attr");
  });

  it("completes the purchase without a referral when the referral discount cannot be prepared", async () => {
    // A rate no earlier test cached, so a Polar discount must be created.
    const { link } = await seedAffiliateWithLink(700);
    const buyer = await seedUser("discount-down-buyer");
    getSessionMock.mockResolvedValue({ user: { id: buyer.id, email: buyer.email } });
    createDiscountMock.mockReset().mockRejectedValue(new Error("Polar is unavailable"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await checkout({ productId: PRODUCT_IDS.PREMIUM_ANNUAL, referralCode: link.code });
      expect(result.status).toBe(200);
      expect(result.body.url).toBe("https://polar.test/checkout/chk_ref_1");
      expect(result.body.referral).toEqual({ applied: false, reason: "unavailable" });
      expect(result.request).not.toHaveProperty("discountId");
      expect(result.request.metadata ?? {}).not.toHaveProperty("nlb_aff_attr");
      expect(errors).toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
