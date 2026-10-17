import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers, entitlements, orders, subscriptions, users, type courseVideos } from "@/lib/db/schema";
import { productIdsForPlans, type MembershipPlan } from "@/lib/polar";
import { ACTIVE_SUBSCRIPTION_STATUSES, readCourseAccessPlans } from "./course-access-policy";
import { getCourseRuntimeEnv } from "./course-runtime-env";

type CourseVideoRow = typeof courseVideos.$inferSelect;

/** Entitlement feature key granted by a paid order for one course video. */
export function videoFeatureKey(courseVideoId: string): string {
  return `video:${courseVideoId}`;
}

export interface CanWatchOptions {
  /** Override the plans that unlock every video (defaults to COURSES_ACCESS_PLANS / the constant). */
  accessPlans?: readonly MembershipPlan[];
  now?: Date;
}

/**
 * True when the viewer may watch the video:
 * 1. an active, unexpired `video:<id>` entitlement, or
 * 2. a paid (or only partially refunded) order for the video's Polar product placed with the
 *    viewer's email, or
 * 3. an active subscription to a plan listed in the course access policy (VIP by default) whose paid
 *    period has not ended. A member who cancels keeps status `active` with `cancel_at_period_end` until
 *    Polar ends the period, so access lasts exactly as long as the paid period; a missed revoke webhook
 *    can never extend it past `current_period_end`.
 * Commerce rows are keyed by customer email, so the user's email links them to orders/subscriptions.
 */
export async function canWatchVideo(
  userId: string,
  video: Pick<CourseVideoRow, "id" | "polarProductId">,
  db: AppDb,
  options: CanWatchOptions = {}
): Promise<boolean> {
  const now = options.now ?? new Date();

  const [entitlement] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.featureKey, videoFeatureKey(video.id)),
        eq(entitlements.isActive, true),
        or(isNull(entitlements.validUntil), gt(entitlements.validUntil, now))
      )
    )
    .limit(1);
  if (entitlement) return true;

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const email = user?.email.trim().toLowerCase();
  if (!email) return false;

  if (video.polarProductId) {
    const [paidOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          sql`lower(${customers.email}) = ${email}`,
          eq(orders.polarProductId, video.polarProductId),
          // A partial refund keeps access; only a full refund (`refunded`) ends it.
          inArray(orders.status, ["paid", "partially_refunded"])
        )
      )
      .limit(1);
    if (paidOrder) return true;
  }

  const plans = options.accessPlans ?? readCourseAccessPlans(getCourseRuntimeEnv().COURSES_ACCESS_PLANS);
  const planProductIds = productIdsForPlans(plans);
  if (planProductIds.length === 0) return false;

  const [activeSubscription] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        sql`lower(${customers.email}) = ${email}`,
        inArray(subscriptions.polarProductId, planProductIds),
        inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
        gt(subscriptions.currentPeriodEnd, now)
      )
    )
    .limit(1);
  return Boolean(activeSubscription);
}
