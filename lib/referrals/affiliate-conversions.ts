/**
 * Turns verified Polar orders into commission, and refunds into reversals. Driven by the signed
 * webhook only (never by a browser redirect). Every step is an idempotent "ensure": a retried,
 * duplicated or out-of-order event converges on the same rows, because the conversion is unique per
 * order, attribution and buyer, and each ledger movement has a deterministic idempotency key.
 */
import { and, eq, lte } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateAttributions, affiliateConversions } from "@/lib/db/schema";
import { conversionBalances, ledgerInsert, planReversal, recordLedgerMove, reversedTotal } from "./commission-ledger";
import { AFFILIATE_METADATA_KEY } from "./affiliate-checkout";
import { commissionMinor, reversalTarget } from "./program-math";
import { getActiveRules } from "./program-rules";
import { ReferralError, referralNotFound } from "./referral-errors";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Billing reasons of a first settled payment. Renewals and plan changes carry the same metadata and are ignored. */
const FIRST_PAYMENT_REASONS = new Set(["purchase", "subscription_create"]);

/** The fields of a Polar order (webhook JSON, snake_case) this module reads. */
export interface PolarOrderForReferral {
  id?: string;
  status?: string;
  paid?: boolean;
  billing_reason?: string | null;
  product_id?: string | null;
  product?: { id?: string } | null;
  discount_id?: string | null;
  currency?: string;
  subtotal_amount?: number;
  discount_amount?: number;
  net_amount?: number;
  tax_amount?: number;
  refunded_amount?: number;
  refunded_tax_amount?: number;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type ConversionRow = typeof affiliateConversions.$inferSelect;

const int = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

function isSettled(order: PolarOrderForReferral): boolean {
  return order.paid === true || order.status === "paid" || order.status === "refunded" || order.status === "partially_refunded";
}

export type ReferralSyncOutcome = "no_referral" | "ignored" | "not_paid" | "accrued" | "held" | "synced" | "rejected";

/**
 * Syncs one order event into the referral ledger. Safe to call for every `order.*` event: it accrues
 * the commission once the order is settled and reverses proportionally whenever the refunded amount grows.
 */
export async function syncReferralOrder(db: AppDb, order: PolarOrderForReferral, now = new Date()): Promise<ReferralSyncOutcome> {
  const attributionId = typeof order.metadata?.[AFFILIATE_METADATA_KEY] === "string" ? (order.metadata[AFFILIATE_METADATA_KEY] as string) : null;
  if (!attributionId || !order.id) return "no_referral";
  if (!FIRST_PAYMENT_REASONS.has(order.billing_reason ?? "")) return "ignored";

  let conversion = await findConversionByOrder(db, order.id);
  let outcome: ReferralSyncOutcome = "synced";
  if (!conversion) {
    if (!isSettled(order)) return "not_paid";
    const [attribution] = await db.select().from(affiliateAttributions).where(eq(affiliateAttributions.id, attributionId)).limit(1);
    if (!attribution) {
      console.warn("referral: order references an unknown attribution", { orderId: order.id });
      return "rejected";
    }
    const created = await createConversion(db, attribution, order, now);
    if (!created) return "rejected";
    conversion = created;
    outcome = created.status === "held" ? "held" : "accrued";
  }
  await ensureAccrual(db, conversion);
  await syncRefund(db, conversion, order, now);
  return outcome;
}

async function findConversionByOrder(db: AppDb, polarOrderId: string): Promise<ConversionRow | null> {
  const [row] = await db.select().from(affiliateConversions).where(eq(affiliateConversions.polarOrderId, polarOrderId)).limit(1);
  return row ?? null;
}

/** Reasons to freeze a conversion for review instead of accruing it as normal. */
function holdReasonFor(attribution: typeof affiliateAttributions.$inferSelect, order: PolarOrderForReferral, currency: string): string | null {
  const productId = order.product_id ?? order.product?.id ?? null;
  if (productId !== attribution.polarProductId) return "product_mismatch";
  if (order.metadata?.nlb_user_id !== attribution.buyerUserId) return "buyer_mismatch";
  if ((order.discount_id ?? null) !== attribution.polarDiscountId) return "discount_mismatch";
  if ((order.currency ?? "").toLowerCase() !== currency) return "currency_mismatch";
  const createdAt = order.created_at ? Date.parse(order.created_at) : NaN;
  if (!Number.isFinite(createdAt) || createdAt > attribution.expiresAt.getTime()) return "binding_expired";
  return null;
}

async function createConversion(
  db: AppDb,
  attribution: typeof affiliateAttributions.$inferSelect,
  order: PolarOrderForReferral,
  now: Date
): Promise<ConversionRow | null> {
  const { rules } = await getActiveRules(db);
  const holdReason = holdReasonFor(attribution, order, rules.currency);
  const subtotal = int(order.subtotal_amount);
  const discount = int(order.discount_amount);
  const net = order.net_amount === undefined ? Math.max(0, subtotal - discount) : int(order.net_amount);
  const commission = commissionMinor(net, attribution.commissionBps);
  const paidAt = order.created_at && Number.isFinite(Date.parse(order.created_at)) ? new Date(order.created_at) : now;

  const [row] = await db
    .insert(affiliateConversions)
    .values({
      attributionId: attribution.id,
      affiliateId: attribution.affiliateId,
      buyerUserId: attribution.buyerUserId,
      polarOrderId: order.id as string,
      polarProductId: order.product_id ?? order.product?.id ?? attribution.polarProductId,
      currency: (order.currency ?? rules.currency).toLowerCase(),
      subtotalMinor: subtotal,
      discountMinor: discount,
      netMinor: net,
      taxMinor: int(order.tax_amount),
      commissionBps: attribution.commissionBps,
      commissionMinor: commission,
      status: holdReason ? "held" : "pending",
      holdReason,
      paidAt,
      maturesAt: new Date(paidAt.getTime() + rules.holdDays * DAY_MS),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (row) {
    await db.update(affiliateAttributions).set({ status: "converted" }).where(eq(affiliateAttributions.id, attribution.id));
    return row;
  }
  // Same order already stored (concurrent delivery): use it. Otherwise the buyer was already referred.
  const existing = await findConversionByOrder(db, order.id as string);
  if (existing) return existing;
  await db
    .update(affiliateAttributions)
    .set({ status: "rejected" })
    .where(and(eq(affiliateAttributions.id, attribution.id), eq(affiliateAttributions.status, "pending")));
  return null;
}

/** Accrual of the full commission into `pending` (or `held` when frozen). Idempotent per order. */
async function ensureAccrual(db: AppDb, conversion: ConversionRow): Promise<void> {
  if (conversion.commissionMinor <= 0) return;
  await recordLedgerMove(db, {
    affiliateId: conversion.affiliateId,
    conversionId: conversion.id,
    kind: "accrual",
    from: null,
    to: conversion.holdReason && conversion.status === "held" ? "held" : "pending",
    amountMinor: conversion.commissionMinor,
    currency: conversion.currency,
    idempotencyKey: `accrual:${conversion.polarOrderId}`,
    reason: conversion.holdReason,
  });
}

/** Reverses commission in proportion to the net amount refunded; the refunded amount only grows. */
async function syncRefund(db: AppDb, conversion: ConversionRow, order: PolarOrderForReferral, now: Date): Promise<void> {
  const refundedNet = Math.min(conversion.netMinor, Math.max(0, int(order.refunded_amount) - int(order.refunded_tax_amount)));
  if (refundedNet <= conversion.refundedNetMinor) return;
  const target = reversalTarget(conversion.commissionMinor, conversion.netMinor, refundedNet);
  const already = await reversedTotal(db, conversion.id);
  const delta = target - already;
  if (delta > 0) {
    const plan = planReversal(await conversionBalances(db, conversion.id), delta);
    await db.batch(
      plan.map((step, index) =>
        ledgerInsert(db, {
          affiliateId: conversion.affiliateId,
          conversionId: conversion.id,
          kind: "reversal",
          from: step.from,
          to: null,
          amountMinor: step.amount,
          currency: conversion.currency,
          idempotencyKey: `reversal:${conversion.id}:${target}:${index}`,
          reason: "refund",
        })
      ) as [ReturnType<typeof ledgerInsert>, ...ReturnType<typeof ledgerInsert>[]]
    );
  }
  const fullyRefunded = refundedNet >= conversion.netMinor;
  await db
    .update(affiliateConversions)
    .set({ refundedNetMinor: refundedNet, ...(fullyRefunded ? { status: "reversed" as const } : {}), updatedAt: now })
    .where(and(eq(affiliateConversions.id, conversion.id), lte(affiliateConversions.refundedNetMinor, refundedNet)));
}

/**
 * Moves commissions whose refund hold has passed from `pending` to `available`. Each conversion is
 * claimed with a conditional status update, so concurrent runs mature it once.
 */
export async function matureConversions(db: AppDb, now = new Date(), limit = 200): Promise<number> {
  const due = await db
    .select()
    .from(affiliateConversions)
    .where(and(eq(affiliateConversions.status, "pending"), lte(affiliateConversions.maturesAt, now)))
    .limit(limit);
  let matured = 0;
  for (const conversion of due) {
    const [claimed] = await db
      .update(affiliateConversions)
      .set({ status: "available", updatedAt: now })
      .where(and(eq(affiliateConversions.id, conversion.id), eq(affiliateConversions.status, "pending")))
      .returning({ id: affiliateConversions.id });
    if (!claimed) continue;
    const { pending } = await conversionBalances(db, conversion.id);
    if (pending > 0) {
      await recordLedgerMove(db, {
        affiliateId: conversion.affiliateId,
        conversionId: conversion.id,
        kind: "maturation",
        from: "pending",
        to: "available",
        amountMinor: pending,
        currency: conversion.currency,
        idempotencyKey: `maturation:${conversion.id}`,
      });
    }
    matured++;
  }
  return matured;
}

/** Operator: freeze a pending conversion (suspected fraud, dispute). Its commission moves to `held`. */
export async function holdConversion(db: AppDb, conversionId: string, input: { reason: string; actorUserId: string }, now = new Date()): Promise<ConversionRow> {
  const [conversion] = await db.select().from(affiliateConversions).where(eq(affiliateConversions.id, conversionId)).limit(1);
  if (!conversion) throw referralNotFound("Conversion");
  const [updated] = await db
    .update(affiliateConversions)
    .set({ status: "held", holdReason: input.reason, updatedAt: now })
    .where(and(eq(affiliateConversions.id, conversionId), eq(affiliateConversions.status, "pending")))
    .returning();
  if (!updated) throw new ReferralError(409, "invalid_transition", "Only pending conversions can be held");
  const { pending } = await conversionBalances(db, conversionId);
  if (pending > 0) {
    await recordLedgerMove(db, {
      affiliateId: conversion.affiliateId,
      conversionId,
      kind: "hold",
      from: "pending",
      to: "held",
      amountMinor: pending,
      currency: conversion.currency,
      idempotencyKey: `hold:${conversionId}:${updated.updatedAt.getTime()}`,
      actorUserId: input.actorUserId,
      reason: input.reason,
    });
  }
  return updated;
}

/** Operator: release a held conversion back to `pending`; it matures on its original schedule. */
export async function releaseConversion(db: AppDb, conversionId: string, input: { actorUserId: string }, now = new Date()): Promise<ConversionRow> {
  const [updated] = await db
    .update(affiliateConversions)
    .set({ status: "pending", holdReason: null, updatedAt: now })
    .where(and(eq(affiliateConversions.id, conversionId), eq(affiliateConversions.status, "held")))
    .returning();
  if (!updated) throw new ReferralError(409, "invalid_transition", "Only held conversions can be released");
  const { held } = await conversionBalances(db, conversionId);
  if (held > 0) {
    await recordLedgerMove(db, {
      affiliateId: updated.affiliateId,
      conversionId,
      kind: "release",
      from: "held",
      to: "pending",
      amountMinor: held,
      currency: updated.currency,
      idempotencyKey: `release:${conversionId}:${now.getTime()}`,
      actorUserId: input.actorUserId,
    });
  }
  return updated;
}
