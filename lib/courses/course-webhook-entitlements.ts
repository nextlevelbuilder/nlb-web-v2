import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { courseVideos, entitlements, orders, users } from "@/lib/db/schema";
import { videoFeatureKey } from "./course-video-access";

/**
 * Course video products are created at runtime, so they are not in the static Polar allowlist.
 * Returns true when any of the ids belongs to a course video.
 */
export async function hasCourseVideoProduct(productIds: readonly string[], db: AppDb): Promise<boolean> {
  if (productIds.length === 0) return false;
  const [match] = await db
    .select({ id: courseVideos.id })
    .from(courseVideos)
    .where(inArray(courseVideos.polarProductId, [...productIds]))
    .limit(1);
  return Boolean(match);
}

/** Order fields the entitlement sync needs, as delivered in Polar `order.*` webhook payloads. */
export interface CourseOrderEvent {
  type: string;
  data?: {
    id?: string;
    status?: string;
    paid?: boolean;
    product_id?: string;
    product?: { id?: string };
    customer_email?: string;
    customer?: { email?: string };
    metadata?: Record<string, unknown>;
  };
}

async function resolveBuyerUserId(order: NonNullable<CourseOrderEvent["data"]>, db: AppDb): Promise<string | null> {
  const metadataUserId = typeof order.metadata?.userId === "string" ? order.metadata.userId : null;
  if (metadataUserId) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, metadataUserId)).limit(1);
    if (user) return user.id;
  }
  const email = (order.customer?.email || order.customer_email || "").trim().toLowerCase();
  if (!email) return null;
  const [user] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  return user?.id ?? null;
}

/**
 * Keep the `video:<id>` entitlement in step with a course video order:
 * a paid order grants it (idempotent on userId + featureKey); a fully refunded order deactivates it
 * and marks the stored order refunded so the paid-order fallback in canWatchVideo stops matching.
 * No-op for orders that are not for a course video product.
 */
export async function syncCourseVideoEntitlementFromOrder(event: CourseOrderEvent, db: AppDb): Promise<void> {
  const order = event.data;
  const productId = order?.product_id || order?.product?.id;
  if (!order || !productId) return;

  const [video] = await db
    .select({ id: courseVideos.id })
    .from(courseVideos)
    .where(eq(courseVideos.polarProductId, productId))
    .limit(1);
  if (!video) return;

  const refunded = event.type === "order.refunded" || order.status === "refunded";
  const paid = !refunded && (order.status === "paid" || order.paid === true || event.type === "order.paid");
  if (!refunded && !paid) return;

  const userId = await resolveBuyerUserId(order, db);
  const featureKey = videoFeatureKey(video.id);

  if (refunded) {
    if (order.id) {
      await db.update(orders).set({ status: "refunded" }).where(eq(orders.polarOrderId, order.id));
    }
    if (userId) {
      await db
        .update(entitlements)
        .set({ isActive: false, validUntil: new Date() })
        .where(and(eq(entitlements.userId, userId), eq(entitlements.featureKey, featureKey)));
    }
    return;
  }

  if (!userId) {
    // The paid order is stored by email; canWatchVideo still matches it once the buyer signs up.
    console.warn("Course video order paid by an email with no account yet:", { orderId: order.id, courseVideoId: video.id });
    return;
  }
  await db
    .insert(entitlements)
    .values({ userId, featureKey, isActive: true })
    .onConflictDoNothing({ target: [entitlements.userId, entitlements.featureKey] });
}
