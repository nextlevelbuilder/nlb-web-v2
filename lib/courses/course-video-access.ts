import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers, entitlements, orders, subscriptions, users, type courseVideos } from "@/lib/db/schema";
import type { MembershipPlan } from "@/lib/polar";
import { resolveEffectiveTier } from "@/lib/membership/effective-tier";
import { toMembershipState } from "@/lib/membership/member-access";
import { getPastDueGraceDays } from "@/lib/onboarding/flags";
import { readCourseAccessPlans } from "./course-access-policy";
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
 * 3. a subscription that currently grants a membership tier listed in the course access policy
 *    (Premium and VIP by default). The grant follows the membership resolver used everywhere else:
 *    active or trialing, until `current_period_end` once cancelled, and through the past-due grace
 *    period; early-bird annual products count as their plan.
 * Subscriptions are found through the customer linked to the user (`customers.user_id`) or, for
 * purchases not linked yet, the customer whose email equals the user's email.
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

  if (email && video.polarProductId) {
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
  if (plans.length === 0) return false;

  const owner = email
    ? or(eq(customers.userId, userId), sql`lower(trim(${customers.email})) = ${email}`)
    : eq(customers.userId, userId);
  const rows = await db
    .select({ subscription: subscriptions })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(owner);
  const graceDays = getPastDueGraceDays();
  // Each subscription is judged on its own, so a VIP grant still counts when only Premium is listed and vice versa.
  return rows.some(({ subscription }) => {
    const { tier } = resolveEffectiveTier([toMembershipState(subscription)], now, graceDays);
    return tier !== "none" && plans.includes(tier);
  });
}
