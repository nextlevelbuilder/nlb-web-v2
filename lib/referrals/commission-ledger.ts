/**
 * Append-only commission ledger. Every movement is one row moving `amountMinor` from a bucket to
 * another (null = outside the ledger) under a unique idempotency key, so retries and concurrent
 * writers cannot double-count. Balances are sums, never stored. See docs/affiliate-program-adr.md.
 */
import { eq, inArray, sql, type SQL } from "drizzle-orm";
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

/** One ledger row whose values may be SQL expressions over the `from` clause of an `INSERT … SELECT`. */
export interface LedgerSelectRow {
  /** Defaults to a fresh SQL-generated UUID per row. */
  id?: SQL | string;
  affiliateId: SQL | string;
  conversionId?: SQL | string | null;
  payoutItemId?: SQL | string | null;
  kind: LedgerEntryKind;
  from: LedgerBucket | null;
  to: LedgerBucket | null;
  amount: SQL;
  currency: SQL | string;
  idempotencyKey: SQL | string;
  actorUserId?: string | null;
  reason?: string | null;
  createdAt: Date;
}

/**
 * Guarded ledger write: `INSERT … SELECT <row> <source>`, where `source` is the `from … where …`
 * clause that decides whether (and how many) rows are written. Amounts are computed by SQLite at write
 * time. A replayed idempotency key is a no-op. Batchable with `db.batch`.
 */
export function ledgerInsertSelect(db: AppDb, row: LedgerSelectRow, source: SQL) {
  if (row.from === row.to) throw new TypeError("a ledger move needs two different buckets");
  const bucket = (value: LedgerBucket | null) => (value === null ? sql`null` : bucketLiteral(value));
  // Column order must match the table definition (drizzle lists every column for INSERT … SELECT).
  const select = sql`select ${row.id ?? SQL_UUID}, ${row.affiliateId}, ${row.conversionId ?? null}, ${row.payoutItemId ?? null}, ${row.kind}, ${bucket(row.from)}, ${bucket(row.to)}, ${row.amount}, ${row.currency}, ${row.idempotencyKey}, ${row.actorUserId ?? null}, ${row.reason ?? null}, ${row.createdAt.getTime()} ${source}`;
  return db.insert(commissionLedger).select(select).onConflictDoNothing({ target: commissionLedger.idempotencyKey });
}

/** A random UUID (v4 layout) generated by SQLite, for ledger rows written by a multi-row `INSERT … SELECT`. */
export const SQL_UUID = sql.raw(
  "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))"
);

function bucketLiteral(bucket: LedgerBucket): SQL {
  if (!LEDGER_BUCKETS.includes(bucket)) throw new TypeError(`unknown ledger bucket ${bucket}`);
  return sql.raw(`'${bucket}'`);
}

/**
 * Scalar SQL: the current balance of `bucket` over the ledger rows of one conversion (`scope` =
 * "conversion") or one affiliate (`scope` = "affiliate"), where `owner` is an SQL expression or value
 * for that id. Used inside guarded statements so amounts are computed from the ledger at write time,
 * never from a snapshot read earlier.
 */
export function bucketBalanceSql(scope: "conversion" | "affiliate", owner: SQL | string, bucket: LedgerBucket): SQL {
  const column = sql.raw(scope === "conversion" ? "bl.conversion_id" : "bl.affiliate_id");
  const name = bucketLiteral(bucket);
  return sql`(select coalesce(sum(case when bl.to_bucket = ${name} then bl.amount_minor else 0 end) - sum(case when bl.from_bucket = ${name} then bl.amount_minor else 0 end), 0) from commission_ledger bl where ${column} = ${owner})`;
}

/** Scalar SQL: the commission reversed so far for the conversion `owner`. */
export function reversedTotalSql(owner: SQL | string): SQL {
  return sql`(select coalesce(sum(rl.amount_minor), 0) from commission_ledger rl where rl.conversion_id = ${owner} and rl.kind = 'reversal')`;
}

/** Bucket balances per affiliate in one grouped query (ids are chunked under D1's bound-parameter limit). */
export async function affiliateBalancesMany(db: AppDb, affiliateIds: readonly string[]): Promise<Map<string, LedgerBalances>> {
  const result = new Map<string, LedgerBalances>();
  for (const id of affiliateIds) result.set(id, emptyBalances());
  for (let start = 0; start < affiliateIds.length; start += SQL_ID_CHUNK) {
    const ids = affiliateIds.slice(start, start + SQL_ID_CHUNK);
    const rows = await db
      .select({ affiliateId: sql<string>`affiliate_id`, bucket: sql<LedgerBucket>`bucket`, total: sql<number>`sum(delta)` })
      .from(
        sql`(select ${commissionLedger.affiliateId} as affiliate_id, ${commissionLedger.toBucket} as bucket, ${commissionLedger.amountMinor} as delta from ${commissionLedger} where ${inArray(commissionLedger.affiliateId, ids)} and ${commissionLedger.toBucket} is not null
            union all
            select ${commissionLedger.affiliateId} as affiliate_id, ${commissionLedger.fromBucket} as bucket, -${commissionLedger.amountMinor} as delta from ${commissionLedger} where ${inArray(commissionLedger.affiliateId, ids)} and ${commissionLedger.fromBucket} is not null)`
      )
      .groupBy(sql`affiliate_id`, sql`bucket`);
    for (const row of rows) {
      const balances = result.get(row.affiliateId);
      if (balances && row.bucket in balances) balances[row.bucket] = Number(row.total) || 0;
    }
  }
  return result;
}

/** Ids per `IN (…)` list: D1 allows at most 100 bound parameters per statement. */
export const SQL_ID_CHUNK = 45;
