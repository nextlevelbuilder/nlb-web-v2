/**
 * Append-only commission ledger. Every movement is one row moving `amountMinor` from a bucket to
 * another (null = outside the ledger) under a unique idempotency key, so retries and concurrent
 * writers cannot double-count. Balances are sums, never stored. See docs/affiliate-program-adr.md.
 */
import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { commissionLedger } from "@/lib/db/schema";
import type { LedgerBucket, LedgerEntryKind } from "./types";

export const LEDGER_BUCKETS: readonly LedgerBucket[] = ["pending", "held", "available", "payout_locked", "paid"];

export type LedgerBalances = Record<LedgerBucket, number>;

export interface LedgerMove {
  affiliateId: string;
  conversionId?: string | null;
  payoutItemId?: string | null;
  kind: LedgerEntryKind;
  from: LedgerBucket | null;
  to: LedgerBucket | null;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  actorUserId?: string | null;
  reason?: string | null;
}

/** The insert of one movement; `onConflictDoNothing` makes a replay a no-op. Use in `db.batch`. */
export function ledgerInsert(db: AppDb, move: LedgerMove) {
  if (!Number.isInteger(move.amountMinor) || move.amountMinor <= 0) throw new TypeError("ledger amounts are positive integers");
  if (move.from === move.to) throw new TypeError("a ledger move needs two different buckets");
  return db
    .insert(commissionLedger)
    .values({
      affiliateId: move.affiliateId,
      conversionId: move.conversionId ?? null,
      payoutItemId: move.payoutItemId ?? null,
      kind: move.kind,
      fromBucket: move.from,
      toBucket: move.to,
      amountMinor: move.amountMinor,
      currency: move.currency,
      idempotencyKey: move.idempotencyKey,
      actorUserId: move.actorUserId ?? null,
      reason: move.reason ?? null,
    })
    .onConflictDoNothing({ target: commissionLedger.idempotencyKey });
}

/** Writes one movement; returns false when the idempotency key was already used. */
export async function recordLedgerMove(db: AppDb, move: LedgerMove): Promise<boolean> {
  const result = await ledgerInsert(db, move);
  return ((result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
}

function emptyBalances(): LedgerBalances {
  return { pending: 0, held: 0, available: 0, payout_locked: 0, paid: 0 };
}

async function sumBuckets(db: AppDb, where: ReturnType<typeof eq>): Promise<LedgerBalances> {
  const rows = await db
    .select({
      bucket: sql<LedgerBucket>`bucket`,
      total: sql<number>`sum(delta)`,
    })
    .from(
      sql`(select ${commissionLedger.toBucket} as bucket, ${commissionLedger.amountMinor} as delta from ${commissionLedger} where ${where} and ${commissionLedger.toBucket} is not null
          union all
          select ${commissionLedger.fromBucket} as bucket, -${commissionLedger.amountMinor} as delta from ${commissionLedger} where ${where} and ${commissionLedger.fromBucket} is not null)`
    )
    .groupBy(sql`bucket`);
  const balances = emptyBalances();
  for (const row of rows) if (row.bucket in balances) balances[row.bucket] = Number(row.total) || 0;
  return balances;
}

/** Bucket balances of one affiliate. `available` can be negative: a reversal after payout carries forward. */
export function affiliateBalances(db: AppDb, affiliateId: string): Promise<LedgerBalances> {
  return sumBuckets(db, eq(commissionLedger.affiliateId, affiliateId));
}

/** Bucket balances of one conversion (where its commission currently sits). */
export function conversionBalances(db: AppDb, conversionId: string): Promise<LedgerBalances> {
  return sumBuckets(db, eq(commissionLedger.conversionId, conversionId));
}

/** Total commission reversed for a conversion so far. */
export async function reversedTotal(db: AppDb, conversionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${commissionLedger.amountMinor}), 0)` })
    .from(commissionLedger)
    .where(and(eq(commissionLedger.conversionId, conversionId), eq(commissionLedger.kind, "reversal")));
  return Number(row?.total ?? 0);
}

/**
 * Splits a reversal of `amount` across the buckets the conversion's money currently sits in: pending
 * first, then held, then available. Whatever is left (already locked or paid out) is taken from the
 * affiliate's available balance, which may go negative and is netted against future earnings.
 */
export function planReversal(balances: LedgerBalances, amount: number): Array<{ from: LedgerBucket; amount: number }> {
  const plan: Array<{ from: LedgerBucket; amount: number }> = [];
  let left = amount;
  for (const bucket of ["pending", "held", "available"] as const) {
    const take = Math.min(left, Math.max(0, balances[bucket]));
    if (take > 0) {
      plan.push({ from: bucket, amount: take });
      left -= take;
    }
  }
  if (left > 0) {
    const last = plan.find((step) => step.from === "available");
    if (last) last.amount += left;
    else plan.push({ from: "available", amount: left });
  }
  return plan;
}
