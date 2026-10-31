import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createDb, getDb, type AppDb } from "@/lib/db";
import { affiliateConversions, affiliatePayoutBatches, affiliatePayoutItems, affiliatePayoutMethods, commissionLedger } from "@/lib/db/schema";
import { attributeCheckout, formatAffiliateCookie } from "@/lib/referrals/affiliate-checkout";
import { matureConversions, refundedNetOf, syncReferralOrder } from "@/lib/referrals/affiliate-conversions";
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
import { affiliateBalances, conversionBalances } from "@/lib/referrals/commission-ledger";
import { holdConversion } from "@/lib/referrals/affiliate-conversions";
import { listAffiliatesForOperators, listLedger, reconciliationReport } from "@/lib/referrals/affiliate-read-models";
import { runReferralCron } from "@/lib/referrals/referral-cron";
import { createLocalD1 } from "../helpers/local-d1";
import { DAY, PREMIUM, TEST_ENCRYPTION_KEY, fakeDiscounts, nextSeq, paidOrder, seedAffiliate, seedAffiliateWithLink, seedUser } from "./referral-fixtures";

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const NOW = new Date("2026-10-31T00:00:00Z");

/** A referred, settled first purchase (0% discount, 10% commission): `net` 10_000 earns 1000. */
async function referredSale(input: { net?: number; tax?: number; paidAt?: Date } = {}) {
  const seeded = await seedAffiliateWithLink(0);
  const buyer = await seedUser("buyer");
  const attempt = await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: seeded.link.code });
  if (!attempt.applied) throw new Error(`not applied: ${attempt.reason}`);
  const orderId = `order-${nextSeq()}`;
  const paidAt = input.paidAt ?? new Date();
  const order = {
    ...paidOrder({ orderId, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: null, net: input.net ?? 10_000, createdAt: paidAt }),
    tax_amount: input.tax ?? 0,
  };
  await syncReferralOrder(getDb(), order, paidAt);
  const [conversion] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.polarOrderId, orderId));
  return { ...seeded, buyer, order, conversion };
}

async function reversedFor(conversionId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${commissionLedger.amountMinor}), 0)` })
    .from(commissionLedger)
    .where(and(eq(commissionLedger.conversionId, conversionId), eq(commissionLedger.kind, "reversal")));
  return Number(row.total);
}

async function expectReconciled() {
  const report = await reconciliationReport(getDb());
  expect(report.negativeBuckets).toEqual([]);
  expect(report.strandedPending).toEqual([]);
  expect(report.checks).toEqual({ paidMatchesItems: true, lockedMatchesItems: true, conversionsBalanced: true, bucketsNonNegative: true, noPendingAfterTransition: true });
}

describe("refund reversals", () => {
  it("reads the refunded amount as pre-tax and a refunded order as a full refund", () => {
    expect(refundedNetOf({ status: "partially_refunded", refunded_amount: 4000 }, 10_000)).toBe(4000);
    expect(refundedNetOf({ status: "partially_refunded", refunded_amount: 12_000 }, 10_000)).toBe(10_000);
    expect(refundedNetOf({ status: "refunded", refunded_amount: 0 }, 10_000)).toBe(10_000);
  });

  it("a full refund of a taxed order reverses the whole commission", async () => {
    const { affiliate, order, conversion } = await referredSale({ net: 10_000, tax: 1000 });
    expect(conversion.commissionMinor).toBe(1000);
    await syncReferralOrder(getDb(), { ...order, status: "refunded", refunded_amount: 10_000, refunded_tax_amount: 1000 });
    expect(await reversedFor(conversion.id)).toBe(1000);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 0, available: 0 });
    const [after] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.id, conversion.id));
    expect(after).toMatchObject({ status: "reversed", refundedNetMinor: 10_000 });
  });

  it("a partial refund of a taxed order reverses in proportion to the pre-tax amount", async () => {
    const { order, conversion } = await referredSale({ net: 10_000, tax: 1000 });
    await syncReferralOrder(getDb(), { ...order, status: "partially_refunded", refunded_amount: 5000, refunded_tax_amount: 500 });
    expect(await reversedFor(conversion.id)).toBe(500);
  });

  it("parallel partial refunds with different targets reverse exactly the largest target", async () => {
    const { affiliate, order, conversion } = await referredSale({ net: 10_000 });
    await Promise.all([
      syncReferralOrder(getDb(), { ...order, status: "partially_refunded", refunded_amount: 4000 }),
      syncReferralOrder(getDb(), { ...order, status: "partially_refunded", refunded_amount: 6000 }),
      syncReferralOrder(getDb(), { ...order, status: "partially_refunded", refunded_amount: 2500 }),
      syncReferralOrder(getDb(), { ...order, status: "partially_refunded", refunded_amount: 6000 }),
    ]);
    expect(await reversedFor(conversion.id)).toBe(600);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 400 });
    const [after] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.id, conversion.id));
    expect(after).toMatchObject({ status: "pending", refundedNetMinor: 6000 });

    // A full refund racing a stale partial one still reverses exactly the commission.
    await Promise.all([
      syncReferralOrder(getDb(), { ...order, status: "partially_refunded", refunded_amount: 7000 }),
      syncReferralOrder(getDb(), { ...order, status: "refunded", refunded_amount: 10_000 }),
    ]);
    expect(await reversedFor(conversion.id)).toBe(1000);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ pending: 0, held: 0, available: 0 });
    await expectReconciled();
  });

  it("maturation racing a refund never leaves pending negative or keeps refunded commission available", async () => {
    const paidAt = new Date(NOW.getTime() - 60 * DAY);
    for (const refund of [{ status: "partially_refunded", refunded_amount: 4000 }, { status: "refunded", refunded_amount: 10_000 }]) {
      const { affiliate, order, conversion } = await referredSale({ net: 10_000, paidAt });
      await Promise.all([matureConversions(getDb(), NOW), syncReferralOrder(getDb(), { ...order, ...refund }, NOW), matureConversions(getDb(), NOW)]);
      const reversed = refund.status === "refunded" ? 1000 : 400;
      expect(await reversedFor(conversion.id)).toBe(reversed);
      const balances = await conversionBalances(getDb(), conversion.id);
      expect(balances.pending).toBe(0);
      expect(balances.held).toBe(0);
      expect(balances.available).toBe(1000 - reversed);
      expect((await affiliateBalances(getDb(), affiliate.id)).available).toBe(1000 - reversed);
    }
    await expectReconciled();
  });
});

describe("maturation", () => {
  it("moves pending to available with the status flip, and payout preview writes nothing", async () => {
    const paidAt = new Date(NOW.getTime() - 60 * DAY);
    const { affiliate, conversion } = await referredSale({ net: 10_000, paidAt });
    const ledgerRows = async () => (await getDb().select({ id: commissionLedger.id }).from(commissionLedger)).length;
    const before = await ledgerRows();
    const preview = await previewPayouts(getDb(), "2026-09", NOW);
    expect(preview.lines.find((line) => line.affiliateId === affiliate.id)).toBeUndefined();
    expect(await ledgerRows()).toBe(before);
    const [still] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.id, conversion.id));
    expect(still.status).toBe("pending");

    expect(await matureConversions(getDb(), NOW)).toBeGreaterThanOrEqual(1);
    const [matured] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.id, conversion.id));
    expect(matured.status).toBe("available");
    expect(await conversionBalances(getDb(), conversion.id)).toMatchObject({ pending: 0, available: 1000 });
    await expectReconciled();
  });

  it("the cron matures a large backlog in a handful of D1 statements", async () => {
    const local = await createLocalD1();
    try {
      let statements = 0;
      const counting = new Proxy(local.d1, {
        get(target, prop, receiver) {
          if (prop === "prepare") {
            return (query: string) => {
              statements++;
              return target.prepare(query);
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as D1Database;
      const db = createDb(local.d1);
      const total = 450;
      const due = new Date(NOW.getTime() - DAY);
      const inserts = Array.from({ length: total }, (_, index) => {
        const conversionId = `bulk-conv-${index}`;
        return [
          db.insert(affiliateConversions).values({
            id: conversionId,
            attributionId: `bulk-attr-${index}`,
            affiliateId: "bulk-aff",
            buyerUserId: `bulk-buyer-${index}`,
            polarOrderId: `bulk-order-${index}`,
            polarProductId: PREMIUM,
            currency: "usd",
            subtotalMinor: 10_000,
            discountMinor: 0,
            netMinor: 10_000,
            taxMinor: 0,
            commissionBps: 1000,
            commissionMinor: 1000,
            paidAt: due,
            maturesAt: due,
          }),
          db.insert(commissionLedger).values({
            affiliateId: "bulk-aff",
            conversionId,
            kind: "accrual",
            fromBucket: null,
            toBucket: "pending",
            amountMinor: 1000,
            currency: "usd",
            idempotencyKey: `accrual:bulk-order-${index}`,
          }),
        ];
      }).flat();
      for (let start = 0; start < inserts.length; start += 100) {
        const chunk = inserts.slice(start, start + 100);
        await db.batch(chunk as unknown as [(typeof chunk)[number], ...(typeof chunk)[number][]]);
      }

      expect(await runReferralCron({ DB: counting }, NOW)).toEqual({ matured: total });
      expect(statements).toBeLessThanOrEqual(10);
      const balances = await affiliateBalances(db, "bulk-aff");
      expect(balances).toMatchObject({ pending: 0, available: total * 1000 });
      expect(await runReferralCron({ DB: counting }, NOW)).toEqual({ matured: 0 });
    } finally {
      await local.dispose();
    }
  });
});

describe("payout batches", () => {
  /** An affiliate with `amount` available (an approved credit) and a PayPal payout method. */
  async function payee(amount = 5000) {
    const { affiliate } = await seedAffiliate();
    await adjustAffiliateBalance(getDb(), { affiliateId: affiliate.id, amountMinor: amount, reason: "seed credit", actorUserId: "op", idempotencyKey: `seed-${nextSeq()}` });
    await setPayoutMethod(getDb(), affiliate.id, { type: "paypal", payeeType: "individual", residency: "other", paypalEmail: `p${nextSeq()}@example.com` });
    return affiliate;
  }

  async function locksFor(itemId: string) {
    return getDb()
      .select()
      .from(commissionLedger)
      .where(and(eq(commissionLedger.payoutItemId, itemId), eq(commissionLedger.kind, "payout_lock")));
  }

  /** Points `getDb()` at a fresh in-memory D1, so no payee from another scenario joins its batches. Returns the undo. */
  async function switchToFreshDb(): Promise<() => Promise<void>> {
    const holder = globalThis as { __NLB_TEST_DB__?: AppDb };
    const previous = holder.__NLB_TEST_DB__;
    const local = await createLocalD1();
    holder.__NLB_TEST_DB__ = local.db;
    return async () => {
      holder.__NLB_TEST_DB__ = previous;
      await local.dispose();
    };
  }

  let restoreDb: (() => Promise<void>) | null = null;
  beforeEach(async () => {
    restoreDb = await switchToFreshDb();
  });
  afterEach(async () => {
    await restoreDb?.();
    restoreDb = null;
  });

  it("parallel batch creation for two periods locks the available balance once", async () => {
    const affiliate = await payee(5000);
    const results = await Promise.allSettled([createPayoutBatch(getDb(), "2026-09", "op-1", NOW), createPayoutBatch(getDb(), "2026-08", "op-2", NOW)]);
    const balances = await affiliateBalances(getDb(), affiliate.id);
    expect(balances).toMatchObject({ available: 0, payout_locked: 5000 });
    const items = await getDb().select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.affiliateId, affiliate.id));
    expect(items).toHaveLength(1);
    expect(items[0].grossMinor).toBe(5000);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "nothing_to_pay" });
    }
    await expectReconciled();
  });

  it("never leaves an item without its lock", async () => {
    const affiliates = [await payee(3000), await payee(4000), await payee(5000)];
    // A debit races batch creation: either the lock wins or the item is skipped, never half of each.
    const [created] = await Promise.allSettled([
      createPayoutBatch(getDb(), "2026-07", "op-1", NOW),
      adjustAffiliateBalance(getDb(), { affiliateId: affiliates[1].id, amountMinor: -4000, reason: "chargeback recovery", actorUserId: "op", idempotencyKey: `debit-${nextSeq()}` }),
    ]);
    expect(created.status).toBe("fulfilled");
    const items = await getDb().select().from(affiliatePayoutItems);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const locks = await locksFor(item.id);
      expect(locks).toHaveLength(1);
      expect(locks[0].amountMinor).toBe(item.grossMinor);
    }
    for (const affiliate of affiliates) {
      const balances = await affiliateBalances(getDb(), affiliate.id);
      expect(balances.payout_locked).toBeGreaterThanOrEqual(0);
      expect(balances.available).toBeGreaterThanOrEqual(0);
    }
    await expectReconciled();
  });

  it("mark-paid and cancel are atomic and exclusive", async () => {
    vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "true");
    for (const period of ["2026-06", "2026-05", "2026-04"]) {
      // Each round on its own database: a previous round's unlocked money must not join this batch.
      const restoreRound = await switchToFreshDb();
      try {
      const affiliate = await payee(5000);
      const { batch, items } = await createPayoutBatch(getDb(), period, "op-1", NOW);
      const item = items.find((entry) => entry.affiliateId === affiliate.id)!;
      await approvePayoutBatch(getDb(), batch.id, { actorUserId: "op-2", approvalId: null }, NOW);
      const [paid, cancelled] = await Promise.allSettled([
        markPayoutItemPaid(getDb(), item.id, { externalReference: `TX-${period}`, payoutCurrency: "usd", payoutAmountMinor: 4000 }, "op-2", NOW),
        cancelPayoutBatch(getDb(), batch.id, "op-1", NOW),
      ]);
      expect([paid.status, cancelled.status].filter((status) => status === "fulfilled")).toHaveLength(1);
      const [after] = await getDb().select().from(affiliatePayoutBatches).where(eq(affiliatePayoutBatches.id, batch.id));
      const [itemAfter] = await getDb().select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.id, item.id));
      const balances = await affiliateBalances(getDb(), affiliate.id);
      if (paid.status === "fulfilled") {
        expect(after.status).toBe("paid");
        expect(itemAfter.status).toBe("paid");
        expect(balances).toMatchObject({ payout_locked: 0, paid: 5000, available: 0 });
      } else {
        expect(after.status).toBe("cancelled");
        expect(itemAfter.status).toBe("cancelled");
        expect(balances).toMatchObject({ payout_locked: 0, paid: 0, available: 5000 });
      }
      await expectReconciled();
      } finally {
        await restoreRound();
      }
    }
  });

  it("a refused payment record writes neither the item state nor the ledger entry", async () => {
    vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "true");
    const first = await payee(5000);
    const second = await payee(5000);
    const { batch, items } = await createPayoutBatch(getDb(), "2026-03", "op-1", NOW);
    await approvePayoutBatch(getDb(), batch.id, { actorUserId: "op-2", approvalId: null }, NOW);
    const [a, b] = [items.find((item) => item.affiliateId === first.id)!, items.find((item) => item.affiliateId === second.id)!];
    await markPayoutItemPaid(getDb(), a.id, { externalReference: "TX-SHARED-1", payoutCurrency: "usd", payoutAmountMinor: 4000 }, "op-2", NOW);
    await expect(markPayoutItemPaid(getDb(), b.id, { externalReference: "TX-SHARED-1", payoutCurrency: "usd", payoutAmountMinor: 4000 }, "op-2", NOW)).rejects.toMatchObject({ code: "conflict" });
    const [bAfter] = await getDb().select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.id, b.id));
    expect(bAfter.status).toBe("pending");
    expect(await affiliateBalances(getDb(), second.id)).toMatchObject({ payout_locked: 5000, paid: 0 });
    await expectReconciled();

    // A batch with a recorded payment cannot be cancelled; the remaining item can still be paid.
    await expect(cancelPayoutBatch(getDb(), batch.id, "op-1", NOW)).rejects.toMatchObject({ code: "invalid_transition" });
    await markPayoutItemPaid(getDb(), b.id, { externalReference: "TX-SHARED-2", payoutCurrency: "usd", payoutAmountMinor: 4000 }, "op-2", NOW);
    const [batchAfter] = await getDb().select().from(affiliatePayoutBatches).where(eq(affiliatePayoutBatches.id, batch.id));
    expect(batchAfter.status).toBe("paid");
    await expectReconciled();
  });

  it("cancelling a batch frees its period for a new batch", async () => {
    const affiliate = await payee(5000);
    const first = await createPayoutBatch(getDb(), "2026-02", "op-1", NOW);
    await expect(createPayoutBatch(getDb(), "2026-02", "op-1", NOW)).rejects.toMatchObject({ code: "conflict" });
    await cancelPayoutBatch(getDb(), first.batch.id, "op-1", NOW);
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ available: 5000, payout_locked: 0 });

    const second = await createPayoutBatch(getDb(), "2026-02", "op-1", NOW);
    expect(second.batch.id).not.toBe(first.batch.id);
    expect(second.items.find((item) => item.affiliateId === affiliate.id)).toMatchObject({ grossMinor: 5000, status: "pending" });
    expect(await affiliateBalances(getDb(), affiliate.id)).toMatchObject({ available: 0, payout_locked: 5000 });
    await expectReconciled();
  });

  it("binds sealed payout details to their affiliate", async () => {
    const owner = await payee(100);
    const other = await payee(100);
    const [ownerMethod] = await getDb().select().from(affiliatePayoutMethods).where(and(eq(affiliatePayoutMethods.affiliateId, owner.id), eq(affiliatePayoutMethods.status, "active")));
    expect(await revealPayoutDetails(ownerMethod)).toHaveProperty("paypalEmail");
    await expect(revealPayoutDetails({ ...ownerMethod, affiliateId: other.id })).rejects.toThrow();
  });
});

describe("read models", () => {
  it("lists affiliates for operators with grouped balances and standing", async () => {
    const { affiliate } = await referredSale({ net: 10_000 });
    const rows = await listAffiliatesForOperators(getDb(), { limit: 200 });
    expect(rows.find((row) => row.affiliateId === affiliate.id)).toMatchObject({
      level: "starter",
      qualifyingCustomers: 1,
      incentiveBasis: "ordinary",
      budgetBps: 1000,
      balances: { pendingMinor: 1000, availableMinor: 0 },
    });
  });

  it("the member ledger hides an operator's free-text reason and keeps system reasons", async () => {
    const { affiliate, order, conversion } = await referredSale({ net: 10_000 });
    await syncReferralOrder(getDb(), { ...order, status: "partially_refunded", refunded_amount: 1000 });
    await holdConversion(getDb(), conversion.id, { reason: "Internal fraud note", actorUserId: "op" });
    const ledger = await listLedger(getDb(), affiliate.id);
    expect(ledger.find((entry) => entry.kind === "hold")).toMatchObject({ reason: null });
    expect(ledger.find((entry) => entry.kind === "reversal")).toMatchObject({ reason: "refund" });
    expect(JSON.stringify(ledger)).not.toContain("Internal fraud note");
  });
});

describe("reconciliation", () => {
  it("flags negative pending/held/locked buckets and pending money on a conversion that left pending", async () => {
    const { affiliate, conversion } = await referredSale({ net: 10_000 });
    await expectReconciled();
    const db: AppDb = getDb();
    // Simulate the two corruptions the report must catch (the ledger accepts inserts only).
    await db.insert(commissionLedger).values({
      affiliateId: affiliate.id,
      kind: "hold",
      fromBucket: "held",
      toBucket: "available",
      amountMinor: 250,
      currency: "usd",
      idempotencyKey: `corrupt-${nextSeq()}`,
    });
    await db.update(affiliateConversions).set({ status: "available" }).where(eq(affiliateConversions.id, conversion.id));

    const report = await reconciliationReport(db);
    expect(report.checks).toMatchObject({ bucketsNonNegative: false, noPendingAfterTransition: false });
    expect(report.negativeBuckets).toContainEqual({ affiliateId: affiliate.id, bucket: "held", balanceMinor: -250 });
    expect(report.strandedPending).toContainEqual({ conversionId: conversion.id, affiliateId: affiliate.id, status: "available", pendingMinor: 1000 });
  });
});

describe("checkout attribution", () => {
  it("an unknown or unusable explicit code falls back to a valid click cookie", async () => {
    const now = new Date();
    const { link: cookieLink, affiliate } = await seedAffiliateWithLink(0);
    const cookie = formatAffiliateCookie(cookieLink.code, new Date(now.getTime() - DAY));

    const buyer = await seedUser("fallback-buyer");
    expect(await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: "no-such-code", cookieValue: cookie, now })).toMatchObject({
      applied: true,
      source: "cookie",
      code: cookieLink.code,
    });

    // The buyer's own code (self-referral) also falls back to someone else's valid click.
    const { user: selfUser, link: ownLink } = await seedAffiliateWithLink(0);
    expect(await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: selfUser.id, polarProductId: PREMIUM, explicitCode: ownLink.code, cookieValue: cookie, now })).toMatchObject({
      applied: true,
      source: "cookie",
      code: cookieLink.code,
    });

    // Without a usable cookie the explicit code's reason is reported.
    const other = await seedUser("fallback-buyer");
    expect(await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: other.id, polarProductId: PREMIUM, explicitCode: "no-such-code", now })).toEqual({ applied: false, reason: "unknown_code" });
    expect(affiliate.id).toBeTruthy();
  });

  it("an error while attributing is logged and skips the referral instead of failing", async () => {
    const { link } = await seedAffiliateWithLink(300);
    const buyer = await seedUser("discount-error-buyer");
    const failing = { discounts: { create: async () => Promise.reject(new Error("Polar 503")) } } as unknown as Parameters<typeof attributeCheckout>[1];
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await attributeCheckout(getDb(), failing, { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: link.code })).toEqual({ applied: false, reason: "unavailable" });
      expect(errors).toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
