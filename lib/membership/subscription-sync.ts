import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";

type SubscriptionRow = typeof subscriptions.$inferSelect;

/** A Polar subscription state, from a webhook payload or from `subscriptions.get`. */
export interface PolarSubscriptionSnapshot {
  polarSubscriptionId: string;
  /** Local `customers.id`. */
  customerId: string;
  productId: string;
  /** Null when the payload carries no product name; the stored name is then kept. */
  productName: string | null;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  /** Polar `modified_at`, falling back to `created_at` for a never-modified subscription. */
  modifiedAt: Date | null;
}

/**
 * Precedence for two states stamped with the same `modified_at`: a later lifecycle stage wins.
 * A local full refund ranks above everything Polar can report.
 */
const statusRank = (column: unknown) => sql`(case ${column}
  when 'incomplete' then 0
  when 'trialing' then 1
  when 'active' then 1
  when 'past_due' then 2
  when 'refunded' then 4
  else 3 end)`;

/**
 * A locally refunded row that Polar later reports as running again: an `active` or `trialing` state
 * stamped strictly after the refund. Polar keeps billing such a subscription (for example a renewal
 * after a refunded earlier period), so access follows it again.
 */
const resumedAfterRefund = sql`(
  ${subscriptions.status} = 'refunded'
  and excluded.status in ('active', 'trialing')
  and excluded.ended_at is null
  and excluded.polar_modified_at is not null
  and ${subscriptions.polarModifiedAt} is not null
  and excluded.polar_modified_at > ${subscriptions.polarModifiedAt}
)`;

/**
 * Ordering rule for out-of-order and replayed deliveries. An incoming state overwrites the stored one
 * only when all hold:
 * 1. the stored subscription has not ended, or the incoming state is also ended (ended is terminal:
 *    Polar never resumes an ended subscription), or the row ended only through a local refund and
 *    Polar reports it running again afterwards (see `resumedAfterRefund`);
 * 2. it is not older: stored `polar_modified_at` is unknown, or incoming is strictly newer, or both
 *    are equal and the incoming status ranks at least as high (see `statusRank`).
 * An incoming state with no timestamp only fills a row that has none either.
 * `past_due_since` keeps the first time the subscription entered `past_due` and clears on leaving it.
 */
const newerState = sql`(
  (${subscriptions.endedAt} is null or excluded.ended_at is not null or ${resumedAfterRefund})
  and (
    ${subscriptions.polarModifiedAt} is null
    or (excluded.polar_modified_at is not null and (
      excluded.polar_modified_at > ${subscriptions.polarModifiedAt}
      or (excluded.polar_modified_at = ${subscriptions.polarModifiedAt}
          and ${statusRank(sql`excluded.status`)} >= ${statusRank(subscriptions.status)})
    ))
  )
)`;

const ENTITLEMENT_FIELDS = [
  "polarProductId",
  "status",
  "currentPeriodEnd",
  "cancelAtPeriodEnd",
  "pastDueSince",
  "endedAt",
] as const satisfies readonly (keyof SubscriptionRow)[];

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (a instanceof Date ? a.getTime() : a ?? null) === (b instanceof Date ? b.getTime() : b ?? null);
  }
  return (a ?? null) === (b ?? null);
}

export interface SubscriptionSyncResult {
  /** The stored row after the write. */
  row: SubscriptionRow | null;
  /** Whether a field that affects entitlement changed. */
  changed: boolean;
}

/** Insert or update a subscription, never letting an older Polar state overwrite a newer one. */
export async function applySubscriptionSnapshot(
  db: AppDb,
  snapshot: PolarSubscriptionSnapshot,
  now: Date = new Date()
): Promise<SubscriptionSyncResult> {
  const [before] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.polarSubscriptionId, snapshot.polarSubscriptionId))
    .limit(1);

  const pastDueSince = snapshot.status === "past_due" ? (snapshot.modifiedAt ?? now) : null;
  await db
    .insert(subscriptions)
    .values({
      customerId: snapshot.customerId,
      polarSubscriptionId: snapshot.polarSubscriptionId,
      polarProductId: snapshot.productId,
      productName: snapshot.productName ?? "Premium Access",
      status: snapshot.status,
      currentPeriodStart: snapshot.currentPeriodStart,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      pastDueSince,
      endedAt: snapshot.endedAt,
      polarModifiedAt: snapshot.modifiedAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.polarSubscriptionId,
      set: {
        // Upgrades and downgrades move the same Polar subscription to another product.
        polarProductId: sql`case when excluded.polar_product_id <> '' then excluded.polar_product_id else ${subscriptions.polarProductId} end`,
        productName: sql`coalesce(${snapshot.productName}, ${subscriptions.productName})`,
        status: sql`excluded.status`,
        currentPeriodStart: sql`coalesce(excluded.current_period_start, ${subscriptions.currentPeriodStart})`,
        currentPeriodEnd: sql`coalesce(excluded.current_period_end, ${subscriptions.currentPeriodEnd})`,
        cancelAtPeriodEnd: sql`excluded.cancel_at_period_end`,
        pastDueSince: sql`case when excluded.status = 'past_due' then coalesce(${subscriptions.pastDueSince}, excluded.past_due_since) else null end`,
        endedAt: sql`case when ${resumedAfterRefund} then null else coalesce(${subscriptions.endedAt}, excluded.ended_at) end`,
        polarModifiedAt: sql`coalesce(excluded.polar_modified_at, ${subscriptions.polarModifiedAt})`,
        updatedAt: now,
      },
      setWhere: newerState,
    });

  const [after] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.polarSubscriptionId, snapshot.polarSubscriptionId))
    .limit(1);
  const changed = !before || ENTITLEMENT_FIELDS.some((field) => !sameValue(before[field], after?.[field]));
  return { row: after ?? null, changed };
}

/** How far before the stored period start an order may be created and still pay for that period. */
export const CURRENT_PERIOD_ORDER_TOLERANCE_MS = 60 * 60 * 1000;

/**
 * A full refund of the order that paid for the subscription's current period ends that subscription
 * for entitlement. A refund of an order from an earlier period (created before the stored
 * `current_period_start`, less a small clock tolerance) changes nothing, and neither does one for a
 * row with no known period start. Only a later Polar state that shows the subscription running again
 * restores access (see `resumedAfterRefund`). Returns the row when one was updated.
 */
export async function markSubscriptionRefunded(
  db: AppDb,
  polarSubscriptionId: string,
  { refundedAt, orderCreatedAt }: { refundedAt: Date; orderCreatedAt: Date },
  now: Date = new Date()
): Promise<SubscriptionRow | null> {
  const [row] = await db
    .update(subscriptions)
    .set({
      status: "refunded",
      endedAt: sql`coalesce(${subscriptions.endedAt}, ${refundedAt.getTime()})`,
      pastDueSince: null,
      polarModifiedAt: sql`max(coalesce(${subscriptions.polarModifiedAt}, 0), ${refundedAt.getTime()})`,
      updatedAt: now,
    })
    .where(
      and(
        eq(subscriptions.polarSubscriptionId, polarSubscriptionId),
        isNotNull(subscriptions.currentPeriodStart),
        lte(subscriptions.currentPeriodStart, new Date(orderCreatedAt.getTime() + CURRENT_PERIOD_ORDER_TOLERANCE_MS))
      )
    )
    .returning();
  return row ?? null;
}
