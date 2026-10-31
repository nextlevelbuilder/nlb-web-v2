import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { affiliateConversions, affiliateVerifications, commissionLedger } from "@/lib/db/schema";
import { attributeCheckout } from "@/lib/referrals/affiliate-checkout";
import { holdConversion, matureConversions, releaseConversion, syncReferralOrder } from "@/lib/referrals/affiliate-conversions";
import {
  adjustAffiliateBalance,
  approvePayoutBatch,
  cancelPayoutBatch,
  createPayoutBatch,
  markPayoutItemPaid,
  previewPayouts,
  revealPayoutDetails,
  setPayoutMethod,
} from "@/lib/referrals/affiliate-payouts";
import { affiliateBalances } from "@/lib/referrals/commission-ledger";
import { qualifyingCustomers } from "@/lib/referrals/affiliates";
import { reconciliationReport, listConversions } from "@/lib/referrals/affiliate-read-models";
import { DAY, PREMIUM, TEST_ENCRYPTION_KEY, fakeDiscounts, nextSeq, paidOrder, seedAffiliateWithLink, seedUser } from "./referral-fixtures";

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** An affiliate, a referred buyer and that buyer's checkout binding (10% off, so 1111 bps at the member budget… here ordinary: 0% off → 10%). */
async function referredCheckout(discountBps = 0) {
  const seeded = await seedAffiliateWithLink(discountBps);
  const buyer = await seedUser("buyer");
  const attempt = await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: seeded.link.code });
  if (!attempt.applied) throw new Error(`not applied: ${attempt.reason}`);
  return { ...seeded, buyer, attempt };
}

async function conversionFor(orderId: string) {
  const [row] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.polarOrderId, orderId));
  return row;
}

describe("order webhook sync", () => {
  it("accrues once per order, whatever the delivery order or repetition", async () => {
    const { affiliate, buyer, attempt } = await referredCheckout();
    const orderId = `order-${nextSeq()}`;
    const order = paidOrder({ orderId, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: attempt.polarDiscountId, net: 19_900 });

    expect(await syncReferralOrder(getDb(), { ...order, paid: false, status: "pending" })).toBe("not_paid");
    expect(await syncReferralOrder(getDb(), order)).toBe("accrued");
    expect(await syncReferralOrder(getDb(), order)).toBe("synced");
    await Promise.all([syncReferralOrder(getDb(), order), syncReferralOrder(getDb(), order)]);

    const conversion = await conversionFor(orderId);
    expect(conversion).toMatchObject({ status: "pending", commissionBps: 1000, commissionMinor: 1990, netMinor: 19_900 });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 1990, available: 0 });
    const rows = await getDb().select().from(commissionLedger).where(eq(commissionLedger.conversionId, conversion.id));
    expect(rows).toHaveLength(1);
    expect(await qualifyingCustomers(getDb(), affiliate.id)).toBe(1);
    const [view] = await listConversions(getDb(), affiliate.id);
    expect(view).not.toHaveProperty("buyerUserId");
  });

  it("ignores renewals and orders without a referral", async () => {
    const { buyer, attempt } = await referredCheckout();
    const renewal = paidOrder({ orderId: `order-${nextSeq()}`, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: attempt.polarDiscountId, billingReason: "subscription_cycle" });
    expect(await syncReferralOrder(getDb(), renewal)).toBe("ignored");
    expect(await syncReferralOrder(getDb(), { ...renewal, metadata: {} })).toBe("no_referral");
  });

  it("holds a conversion whose order does not match the snapshot", async () => {
    const { affiliate, buyer, attempt } = await referredCheckout(500);
    const orderId = `order-${nextSeq()}`;
    const order = paidOrder({ orderId, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: "some-other-discount" });
    expect(await syncReferralOrder(getDb(), order)).toBe("held");
    expect(await conversionFor(orderId)).toMatchObject({ status: "held", holdReason: "discount_mismatch" });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 0, held: 526 });
    expect(await qualifyingCustomers(getDb(), affiliate.id)).toBe(0);
  });

  it("converts a buyer once, even through a second binding", async () => {
    const { link, buyer, attempt } = await referredCheckout();
    await syncReferralOrder(getDb(), paidOrder({ orderId: `order-${nextSeq()}`, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: null }));
    const again = await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: link.code });
    expect(again).toEqual({ applied: false, reason: "not_first_purchase" });
  });

  it("reverses proportionally on partial refunds and fully on a full refund", async () => {
    const { affiliate, buyer, attempt } = await referredCheckout();
    const orderId = `order-${nextSeq()}`;
    const base = { orderId, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: null, net: 10_000 };
    await syncReferralOrder(getDb(), paidOrder(base));
    await syncReferralOrder(getDb(), paidOrder({ ...base, refunded: 2500 }));
    await syncReferralOrder(getDb(), paidOrder({ ...base, refunded: 2500 }));
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 750 });
    // An older event arriving late never undoes a reversal.
    await syncReferralOrder(getDb(), paidOrder(base));
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 750 });
    await syncReferralOrder(getDb(), paidOrder({ ...base, refunded: 10_000 }));
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 0 });
    expect(await conversionFor(orderId)).toMatchObject({ status: "reversed", refundedNetMinor: 10_000 });
  });

  it("matures after the hold, and hold/release move money between buckets", async () => {
    const { affiliate, buyer, attempt } = await referredCheckout();
    const orderId = `order-${nextSeq()}`;
    const paidAt = new Date("2026-08-01T00:00:00Z");
    await syncReferralOrder(getDb(), paidOrder({ orderId, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: null, createdAt: paidAt }), paidAt);
    const conversion = await conversionFor(orderId);
    await holdConversion(getDb(), conversion.id, { reason: "review", actorUserId: "op" });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 0, held: 1000 });
    expect(await matureConversions(getDb(), new Date(paidAt.getTime() + 60 * DAY))).toBe(0);
    await releaseConversion(getDb(), conversion.id, { actorUserId: "op" });
    expect(await matureConversions(getDb(), new Date(paidAt.getTime() + 44 * DAY))).toBe(0);
    expect(await matureConversions(getDb(), new Date(paidAt.getTime() + 46 * DAY))).toBeGreaterThanOrEqual(1);
    expect(await matureConversions(getDb(), new Date(paidAt.getTime() + 47 * DAY))).toBe(0);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 0, held: 0, available: 1000 });
  });
});

describe("ledger", () => {
  it("is append-only", async () => {
    const { buyer, attempt } = await referredCheckout();
    await syncReferralOrder(getDb(), paidOrder({ orderId: `order-${nextSeq()}`, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: null }));
    await expect(getDb().update(commissionLedger).set({ amountMinor: 1 })).rejects.toThrow();
    await expect(getDb().delete(commissionLedger)).rejects.toThrow();
  });
});

describe("payouts", () => {
  /** Affiliate with `available` commission from one matured referral (net 50_000 → 5000 at 10%). */
  async function availableAffiliate() {
    const { affiliate, buyer, attempt } = await referredCheckout();
    const paidAt = new Date("2026-07-01T00:00:00Z");
    const orderId = `order-${nextSeq()}`;
    await syncReferralOrder(getDb(), paidOrder({ orderId, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: null, net: 50_000, createdAt: paidAt }), paidAt);
    return { affiliate, orderId };
  }

  it("previews blockers, locks once, pays once and reconciles", async () => {
    const now = new Date("2026-10-31T00:00:00Z");
    const { affiliate, orderId } = await availableAffiliate();

    let preview = await previewPayouts(getDb(), "2026-09", now);
    expect(preview.lines.find((line) => line.affiliateId === affiliate.id)?.blockers).toEqual(["payout_method_required"]);
    await expect(previewPayouts(getDb(), "2026-10", now)).rejects.toMatchObject({ code: "period_not_closed" });

    const method = await setPayoutMethod(getDb(), affiliate.id, { type: "paypal", payeeType: "individual", residency: "other", paypalEmail: "payee@example.com" });
    expect(method.displayHint).toBe("PayPal p•••@example.com");
    expect(method.sealedDetails).not.toContain("payee@example.com");
    expect(await revealPayoutDetails(method)).toEqual({ paypalEmail: "payee@example.com" });

    preview = await previewPayouts(getDb(), "2026-09", now);
    const line = preview.lines.find((entry) => entry.affiliateId === affiliate.id)!;
    expect(line).toMatchObject({ blockers: [], availableMinor: 5000, amounts: { grossMinor: 5000, serviceFeeMinor: 1000, withholdingMinor: 0, netMinor: 4000 } });

    const { batch, items } = await createPayoutBatch(getDb(), "2026-09", "op-1", now);
    expect(items).toHaveLength(1);
    await expect(createPayoutBatch(getDb(), "2026-09", "op-1", now)).rejects.toMatchObject({ status: 409 });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ available: 0, payout_locked: 5000 });

    const paid = { externalReference: "PAYPAL-TX-0001", payoutCurrency: "usd", payoutAmountMinor: 4000 };
    vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "true");
    await expect(markPayoutItemPaid(getDb(), items[0].id, paid, "op-2", now)).rejects.toMatchObject({ code: "invalid_transition" });
    await approvePayoutBatch(getDb(), batch.id, { actorUserId: "op-2", approvalId: "approval-1" }, now);

    vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "false");
    await expect(markPayoutItemPaid(getDb(), items[0].id, paid, "op-2", now)).rejects.toMatchObject({ code: "payouts_disabled" });
    vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "true");
    const results = await Promise.allSettled([
      markPayoutItemPaid(getDb(), items[0].id, paid, "op-2", now),
      markPayoutItemPaid(getDb(), items[0].id, paid, "op-3", now),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ payout_locked: 0, paid: 5000 });
    await expect(cancelPayoutBatch(getDb(), batch.id, "op-1", now)).rejects.toMatchObject({ code: "invalid_transition" });

    // A refund after the payout reverses from `available`, which goes negative and is recovered from future earnings.
    await syncReferralOrder(getDb(), { ...paidOrder({ orderId, attributionId: "unused", buyerUserId: "unused", discountId: null, net: 50_000, refunded: 50_000 }) });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ available: -5000, paid: 5000 });

    const report = await reconciliationReport(getDb());
    expect(report.checks).toEqual({ paidMatchesItems: true, lockedMatchesItems: true, conversionsBalanced: true });
  });

  it("refuses a reused external reference and unlocks on cancel", async () => {
    const now = new Date("2026-10-31T00:00:00Z");
    const first = await availableAffiliate();
    const second = await availableAffiliate();
    for (const { affiliate } of [first, second]) {
      await setPayoutMethod(getDb(), affiliate.id, { type: "paypal", payeeType: "individual", residency: "other", paypalEmail: `p${nextSeq()}@example.com` });
    }
    const { batch, items } = await createPayoutBatch(getDb(), "2026-08", "op-1", now);
    const mine = items.filter((item) => item.affiliateId === first.affiliate.id || item.affiliateId === second.affiliate.id);
    expect(mine).toHaveLength(2);
    await approvePayoutBatch(getDb(), batch.id, { actorUserId: "op-2", approvalId: null }, now);
    vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "true");
    await markPayoutItemPaid(getDb(), mine[0].id, { externalReference: "DUP-REF-1", payoutCurrency: "usd", payoutAmountMinor: 4000 }, "op-2", now);
    await expect(
      markPayoutItemPaid(getDb(), mine[1].id, { externalReference: "DUP-REF-1", payoutCurrency: "usd", payoutAmountMinor: 4000 }, "op-2", now)
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("cancel returns locked funds to available", async () => {
    const now = new Date("2026-10-31T00:00:00Z");
    const { affiliate } = await availableAffiliate();
    await setPayoutMethod(getDb(), affiliate.id, { type: "paypal", payeeType: "individual", residency: "other", paypalEmail: "c@example.com" });
    const { batch } = await createPayoutBatch(getDb(), "2026-07", "op-1", now);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ available: 0, payout_locked: 5000 });
    await cancelPayoutBatch(getDb(), batch.id, "op-1", now);
    await cancelPayoutBatch(getDb(), batch.id, "op-1", now).catch(() => undefined);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ available: 5000, payout_locked: 0 });
  });

  it("blocks Vietnamese bank payouts until withholding is approved and identity verified", async () => {
    const now = new Date("2026-10-31T00:00:00Z");
    const { affiliate } = await availableAffiliate();
    await expect(
      setPayoutMethod(getDb(), affiliate.id, { type: "bank_vn", payeeType: "individual", residency: "other", bankName: "VCB", accountHolder: "A", accountNumber: "0123456789" })
    ).rejects.toMatchObject({ status: 400 });
    const method = await setPayoutMethod(getDb(), affiliate.id, { type: "bank_vn", payeeType: "individual", residency: "vn", bankName: "VCB", accountHolder: "NGUYEN A", accountNumber: "0123 456 789" });
    expect(method.displayHint).toBe("VCB ••••6789");
    await getDb().insert(affiliateVerifications).values({ affiliateId: affiliate.id, provider: "manual", providerReference: `ref-${nextSeq()}`, status: "pending" });
    const line = (await previewPayouts(getDb(), "2026-06", now)).lines.find((entry) => entry.affiliateId === affiliate.id)!;
    expect(line.blockers).toEqual(expect.arrayContaining(["withholding_rule_missing", "verification_required"]));
  });

  it("adjusts balances once per approval", async () => {
    const { affiliate } = await availableAffiliate();
    const before = await affiliateBalances(getDb(), affiliate.id);
    expect(await adjustAffiliateBalance(getDb(), { affiliateId: affiliate.id, amountMinor: -300, reason: "chargeback recovery", actorUserId: "op", idempotencyKey: "approval-x" })).toBe(true);
    expect(await adjustAffiliateBalance(getDb(), { affiliateId: affiliate.id, amountMinor: -300, reason: "chargeback recovery", actorUserId: "op", idempotencyKey: "approval-x" })).toBe(false);
    expect((await affiliateBalances(getDb(), affiliate.id)).available).toBe(before.available - 300);
    await expect(adjustAffiliateBalance(getDb(), { affiliateId: affiliate.id, amountMinor: 0, reason: "nothing at all", actorUserId: "op", idempotencyKey: "approval-y" })).rejects.toMatchObject({ status: 400 });
  });
});
