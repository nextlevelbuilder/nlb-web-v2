/**
 * Operator cancel and resume of a stored Polar subscription. Polar is the source of truth: this asks
 * Polar to set `cancel_at_period_end` and stores only the state Polar answers with, through the same
 * ordering rule as the webhook. Access is unchanged until the period ends, so either step is reversible.
 */
import { BuilderApiError } from "@/lib/builder-league/http";
import type { AppDb } from "@/lib/db";
import type { subscriptions } from "@/lib/db/schema";
import { applySubscriptionSnapshot } from "@/lib/membership/subscription-sync";
import { enqueueAccessReconcile } from "@/lib/onboarding/jobs";

type SubscriptionRow = typeof subscriptions.$inferSelect;

/** The slice of the Polar SDK used here (`subscriptions.update`). */
export interface PolarSubscriptionCanceller {
  subscriptions: {
    update(request: { id: string; subscriptionUpdate: { cancelAtPeriodEnd: boolean } }): Promise<{
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

/**
 * Cancels at period end (`cancel: true`) or resumes (`cancel: false`). 409 `subscription_ended` for an
 * ended subscription, `already_canceling` / `not_canceling` when nothing would change, 502
 * `subscription_update_failed` when Polar refuses; nothing local changes in any of those cases.
 */
export async function setSubscriptionCancelAtPeriodEnd(
  db: AppDb,
  client: PolarSubscriptionCanceller,
  subscription: SubscriptionRow,
  options: { cancel: boolean; userId: string | null; now?: Date }
): Promise<SubscriptionRow> {
  const now = options.now ?? new Date();
  if (subscription.endedAt || ["canceled", "revoked", "refunded"].includes(subscription.status)) {
    throw new BuilderApiError(409, "subscription_ended", "This subscription has ended");
  }
  if (Boolean(subscription.cancelAtPeriodEnd) === options.cancel) {
    throw options.cancel
      ? new BuilderApiError(409, "already_canceling", "This subscription already ends at the period end")
      : new BuilderApiError(409, "not_canceling", "This subscription is not set to end");
  }

  let live: Awaited<ReturnType<PolarSubscriptionCanceller["subscriptions"]["update"]>>;
  try {
    live = await client.subscriptions.update({ id: subscription.polarSubscriptionId, subscriptionUpdate: { cancelAtPeriodEnd: options.cancel } });
  } catch (error) {
    console.error("Polar subscription update failed:", { subscriptionId: subscription.id, name: error instanceof Error ? error.name : "error" });
    throw new BuilderApiError(502, "subscription_update_failed", "The payment provider refused the change; retry later");
  }

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
  if (result.changed && options.userId) await enqueueAccessReconcile(db, options.userId, undefined, now);
  return result.row ?? subscription;
}
