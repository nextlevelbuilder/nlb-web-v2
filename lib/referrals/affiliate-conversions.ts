/**
 * Turns verified Polar orders into commission, and refunds into reversals. Driven by the signed
 * webhook only (never by a browser redirect). Every step is an idempotent "ensure": a retried,
 * duplicated or out-of-order event converges on the same rows, because the conversion is unique per
 * order, attribution and buyer, and each ledger movement has a deterministic idempotency key.
 */
import { and, eq, lt, sql, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateAttributions, affiliateConversions } from "@/lib/db/schema";
import { bucketBalanceSql, ledgerInsertSelect, recordLedgerMove, reversedTotalSql } from "./commission-ledger";
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

/**
 * Net (pre-tax) amount refunded so far. Polar's `refunded_amount` is already pre-tax (tax refunds are
 * reported separately in `refunded_tax_amount`), and an order in status `refunded` is refunded in full.
 */
export function refundedNetOf(order: Pick<PolarOrderForReferral, "status" | "refunded_amount">, netMinor: number): number {
  if (order.status === "refunded") return netMinor;
  return Math.min(netMinor, int(order.refunded_amount));
}

/** Buckets a reversal draws from, in order; whatever is left comes out of `available` (it may go negative). */
const REVERSAL_ORDER = ["pending", "held", "available"] as const;

/**
 * One reversal step from `bucket`, as a single guarded statement. The amount is computed in SQL at
 * write time: what is still owed (`target` minus everything reversed so far) capped by what the
 * conversion holds in `bucket` (the last step takes the rest). Concurrent events with different
 * targets therefore converge on the largest target and never over-reverse.
 */
function reversalStep(db: AppDb, conversionId: string, target: number, bucket: (typeof REVERSAL_ORDER)[number], now: Date) {
  const owed = sql`max(${target} - ${reversedTotalSql(sql`c.id`)}, 0)`;
  const amount = bucket === "available" ? owed : sql`min(${owed}, max(${bucketBalanceSql("conversion", sql`c.id`, bucket)}, 0))`;
  return ledgerInsertSelect(
    db,
    {
      id: crypto.randomUUID(),
      affiliateId: sql`s.affiliate_id`,
      conversionId: sql`s.id`,
      kind: "reversal",
      from: bucket,
      to: null,
      amount: sql`s.amount`,
      currency: sql`s.currency`,
      idempotencyKey: `reversal:${conversionId}:${target}:${bucket}`,
      reason: "refund",
      createdAt: now,
    },
    sql`from (select c.id, c.affiliate_id, c.currency, ${amount} as amount from affiliate_conversions c where c.id = ${conversionId}) s where s.amount > 0`
  );
}

/**
 * Reverses commission in proportion to the net amount refunded; the refunded amount only grows. The
 * reversal steps and the conversion's refund state are written in one atomic `db.batch`, each amount
 * computed from the ledger inside the batch, so a stale read or a concurrent event cannot skew them.
 */
async function syncRefund(db: AppDb, conversion: ConversionRow, order: PolarOrderForReferral, now: Date): Promise<void> {
  const refundedNet = refundedNetOf(order, conversion.netMinor);
  if (refundedNet <= 0 || refundedNet <= conversion.refundedNetMinor) return;
  const target = reversalTarget(conversion.commissionMinor, conversion.netMinor, refundedNet);
  const claim = db
    .update(affiliateConversions)
    .set({
      refundedNetMinor: refundedNet,
      status: sql`case when ${refundedNet} >= ${affiliateConversions.netMinor} then 'reversed' else ${affiliateConversions.status} end`,
      updatedAt: now,
    })
    .where(and(eq(affiliateConversions.id, conversion.id), lt(affiliateConversions.refundedNetMinor, refundedNet)));
  if (target <= 0) {
    await claim;
    return;
  }
  await db.batch([claim, ...REVERSAL_ORDER.map((bucket) => reversalStep(db, conversion.id, target, bucket, now))]);
}

/** Pending conversions whose refund hold has passed, oldest first (a fixed, repeatable selection). */
function dueConversionIds(now: Date, limit: number): SQL {
  return sql`(select id from affiliate_conversions where status = 'pending' and matures_at <= ${now.getTime()} order by matures_at, id limit ${limit})`;
}

/**
 * Moves commissions whose refund hold has passed from `pending` to `available`: up to `limit`
 * conversions in one atomic `db.batch` of two statements. The maturation entry moves exactly what each
 * conversion still has in `pending` (computed in SQL, so a refund that landed first is respected), and
 * the status flips in the same batch, so a conversion is never `available` while its money is pending.
 */
export async function matureConversions(db: AppDb, now = new Date(), limit = MATURATION_BATCH_SIZE): Promise<number> {
  const due = dueConversionIds(now, limit);
  const [, claimed] = await db.batch([
    ledgerInsertSelect(
      db,
      {
        affiliateId: sql`s.affiliate_id`,
        conversionId: sql`s.id`,
        kind: "maturation",
        from: "pending",
        to: "available",
        amount: sql`s.amount`,
        currency: sql`s.currency`,
        idempotencyKey: sql`'maturation:' || s.id`,
        createdAt: now,
      },
      sql`from (select c.id, c.affiliate_id, c.currency, ${bucketBalanceSql("conversion", sql`c.id`, "pending")} as amount from affiliate_conversions c where c.id in ${due}) s where s.amount > 0`
    ),
    db
      .update(affiliateConversions)
      .set({ status: "available", updatedAt: now })
      .where(and(sql`${affiliateConversions.id} in ${due}`, eq(affiliateConversions.status, "pending")))
      .returning({ id: affiliateConversions.id }),
  ]);
  return claimed.length;
}

/** Conversions matured per batch, and batches per run: 2 statements each, far below D1's per-invocation query limit. */
export const MATURATION_BATCH_SIZE = 200;
export const MATURATION_MAX_ROUNDS = 5;

/** Matures every due conversion, at most `MATURATION_BATCH_SIZE × MATURATION_MAX_ROUNDS` per call. */
export async function matureDueConversions(db: AppDb, now = new Date()): Promise<number> {
  let matured = 0;
  for (let round = 0; round < MATURATION_MAX_ROUNDS; round++) {
    const count = await matureConversions(db, now, MATURATION_BATCH_SIZE);
    matured += count;
    if (count < MATURATION_BATCH_SIZE) break;
  }
  return matured;
}

/**
 * A conversion status change together with the ledger move of what it currently holds in `from`, as
 * one atomic batch. The move is written first, guarded on the status still being `fromStatus`, and the
 * amount is the bucket balance at write time; the guarded update then flips the status.
 */
async function transitionWithMove(
  db: AppDb,
  input: {
    conversionId: string;
    fromStatus: "pending" | "held";
    set: Partial<typeof affiliateConversions.$inferInsert>;
    move: { kind: "hold" | "release"; from: "pending" | "held"; to: "held" | "pending"; idempotencyKey: string; actorUserId: string; reason?: string | null };
    now: Date;
  }
): Promise<ConversionRow | undefined> {
  const { move } = input;
  const [, updated] = await db.batch([
    ledgerInsertSelect(
      db,
      {
        id: crypto.randomUUID(),
        affiliateId: sql`s.affiliate_id`,
        conversionId: sql`s.id`,
        kind: move.kind,
        from: move.from,
        to: move.to,
        amount: sql`s.amount`,
        currency: sql`s.currency`,
        idempotencyKey: move.idempotencyKey,
        actorUserId: move.actorUserId,
        reason: move.reason ?? null,
        createdAt: input.now,
      },
      sql`from (select c.id, c.affiliate_id, c.currency, ${bucketBalanceSql("conversion", sql`c.id`, move.from)} as amount from affiliate_conversions c where c.id = ${input.conversionId} and c.status = ${input.fromStatus}) s where s.amount > 0`
    ),
    db
      .update(affiliateConversions)
      .set(input.set)
      .where(and(eq(affiliateConversions.id, input.conversionId), eq(affiliateConversions.status, input.fromStatus)))
      .returning(),
  ]);
  return updated[0];
}

/** Operator: freeze a pending conversion (suspected fraud, dispute). Its commission moves to `held`. */
export async function holdConversion(db: AppDb, conversionId: string, input: { reason: string; actorUserId: string }, now = new Date()): Promise<ConversionRow> {
  const [conversion] = await db.select({ id: affiliateConversions.id }).from(affiliateConversions).where(eq(affiliateConversions.id, conversionId)).limit(1);
  if (!conversion) throw referralNotFound("Conversion");
  const updated = await transitionWithMove(db, {
    conversionId,
    fromStatus: "pending",
    set: { status: "held", holdReason: input.reason, updatedAt: now },
    move: { kind: "hold", from: "pending", to: "held", idempotencyKey: `hold:${conversionId}:${now.getTime()}`, actorUserId: input.actorUserId, reason: input.reason },
    now,
  });
  if (!updated) throw new ReferralError(409, "invalid_transition", "Only pending conversions can be held");
  return updated;
}

/** Operator: release a held conversion back to `pending`; it matures on its original schedule. */
export async function releaseConversion(db: AppDb, conversionId: string, input: { actorUserId: string }, now = new Date()): Promise<ConversionRow> {
  const updated = await transitionWithMove(db, {
    conversionId,
    fromStatus: "held",
    set: { status: "pending", holdReason: null, updatedAt: now },
    move: { kind: "release", from: "held", to: "pending", idempotencyKey: `release:${conversionId}:${now.getTime()}`, actorUserId: input.actorUserId },
    now,
  });
  if (!updated) throw new ReferralError(409, "invalid_transition", "Only held conversions can be released");
  return updated;
}
