import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { communityAccessState, customers, subscriptions } from "@/lib/db/schema";
import { enqueueAccessReconcile } from "@/lib/onboarding/jobs";
import { MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS } from "@/lib/polar";
import { getMemberTier } from "./member-access";
import { applySubscriptionSnapshot } from "./subscription-sync";

/** The slice of the Polar SDK the resync uses (`polar.subscriptions.get`). */
export interface PolarSubscriptionReader {
  subscriptions: {
    get(request: { id: string }): Promise<{
      id: string;
      status: string;
      productId: string;
      product?: { name?: string | null } | null;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
      cancelAtPeriodEnd?: boolean | null;
      endedAt?: Date | null;
      modifiedAt?: Date | null;
      createdAt?: Date | null;
    }>;
  };
}

export interface ResyncSummary {
  checked: number;
  changed: number;
  failed: number;
  driftEnqueued: number;
}

/**
 * Recover dropped or delayed webhooks: re-read live membership subscriptions (`active`, `trialing`,
 * `past_due`) from Polar, apply them with the same ordering rule as the webhook, and queue access
 * reconciles for linked users whose state changed. Oldest-synced rows go first so a capped run
 * rotates through every subscription across hours.
 */
export async function resyncMembershipSubscriptions(
  db: AppDb,
  client: PolarSubscriptionReader,
  { limit = 100, now = new Date() }: { limit?: number; now?: Date } = {}
): Promise<ResyncSummary> {
  const summary: ResyncSummary = { checked: 0, changed: 0, failed: 0, driftEnqueued: 0 };
  const productIds = [...MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS];
  if (productIds.length === 0) return summary;

  const rows = await db
    .select({ subscription: subscriptions, userId: customers.userId })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        inArray(subscriptions.status, ["active", "trialing", "past_due"]),
        isNull(subscriptions.endedAt),
        inArray(subscriptions.polarProductId, productIds)
      )
    )
    .orderBy(asc(subscriptions.updatedAt))
    .limit(limit);

  for (const { subscription, userId } of rows) {
    summary.checked += 1;
    try {
      const live = await client.subscriptions.get({ id: subscription.polarSubscriptionId });
      const result = await applySubscriptionSnapshot(
        db,
        {
          polarSubscriptionId: live.id,
          customerId: subscription.customerId,
          productId: live.productId,
          productName: live.product?.name ?? null,
          status: live.status,
          currentPeriodStart: live.currentPeriodStart ?? null,
          currentPeriodEnd: live.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: Boolean(live.cancelAtPeriodEnd),
          endedAt: live.endedAt ?? null,
          modifiedAt: live.modifiedAt ?? live.createdAt ?? null,
        },
        now
      );
      // Touch the row so the next capped run starts with subscriptions that were not just checked.
      await db.update(subscriptions).set({ updatedAt: now }).where(eq(subscriptions.id, subscription.id));
      if (result.changed) {
        summary.changed += 1;
        if (userId) await enqueueAccessReconcile(db, userId, undefined, now);
      }
    } catch {
      summary.failed += 1;
      console.warn(`membership resync failed for subscription row ${subscription.id}`);
    }
  }

  summary.driftEnqueued = await enqueueTierDrift(db, now);
  return summary;
}

/**
 * Time alone changes entitlement (a past_due grace period runs out, a cancel-at-period-end date
 * passes) without any new Polar event. Queue a reconcile for every user whose recorded desired tier
 * no longer matches the resolver. Only users with recorded community state are considered, so
 * nobody who never linked through NLB is touched.
 */
export async function enqueueTierDrift(db: AppDb, now: Date = new Date()): Promise<number> {
  const rows = await db
    .selectDistinct({ userId: communityAccessState.userId })
    .from(communityAccessState)
    .where(or(ne(communityAccessState.desiredTier, "none"), ne(communityAccessState.appliedTier, "none")));
  let enqueued = 0;
  for (const { userId } of rows) {
    const { tier } = await getMemberTier(db, userId, now);
    const states = await db
      .select({ target: communityAccessState.target, desiredTier: communityAccessState.desiredTier })
      .from(communityAccessState)
      .where(eq(communityAccessState.userId, userId));
    const drifted = states.filter((state) => state.desiredTier !== tier).map((state) => state.target);
    if (drifted.length > 0) {
      await enqueueAccessReconcile(db, userId, drifted, now);
      enqueued += drifted.length;
    }
  }
  return enqueued;
}
