import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courseVideos, entitlements, orders, users, webhookEvents } from "@/lib/db/schema";

vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: vi.fn().mockReturnValue(true),
  WebhookVerificationError: class WebhookVerificationError extends Error {},
}));
vi.mock("@/lib/resend", () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true, data: {} }) }));
vi.mock("@/lib/email-form01", () => ({ sendForm01Email: vi.fn().mockResolvedValue({ success: true, data: {} }) }));
const discordMock = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/discord", () => ({ sendDiscordSalesNotification: (...args: unknown[]) => discordMock(...args) }));

const { POST } = await import("@/app/api/webhooks/polar/route");

let seq = 0;

async function seedPublishedVideoAndBuyer() {
  seq += 1;
  const productId = `polar-course-product-${seq}`;
  const [video] = await getDb()
    .insert(courseVideos)
    .values({ slug: `wh-video-${seq}`, title: "Week 2", priceCents: 1900, status: "published", polarProductId: productId })
    .returning();
  const userId = `wh-user-${seq}`;
  const email = `Student${seq}@Example.com`;
  await getDb().insert(users).values({ id: userId, name: "Student", email });
  return { video, productId, userId, email };
}

function deliver(event: Record<string, unknown>, webhookId: string) {
  return POST(
    new Request("https://nlb.test/api/webhooks/polar", {
      method: "POST",
      headers: { "webhook-id": webhookId, "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
      body: JSON.stringify(event),
    })
  );
}

async function entitlementFor(userId: string, videoId: string) {
  const [row] = await getDb()
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.featureKey, `video:${videoId}`)));
  return row;
}

describe("Polar webhook: course video orders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a course video product and grants the video entitlement once", async () => {
    const { video, productId, userId, email } = await seedPublishedVideoAndBuyer();
    const paid = {
      type: "order.paid",
      data: { id: `ord-${seq}`, status: "paid", paid: true, product_id: productId, customer_email: email.toLowerCase(), total_amount: 1900, currency: "usd" },
    };

    const res = await deliver(paid, `wh-paid-${seq}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const row = await entitlementFor(userId, video.id);
    expect(row).toMatchObject({ isActive: true });
    const [order] = await getDb().select().from(orders).where(eq(orders.polarOrderId, `ord-${seq}`));
    expect(order).toMatchObject({ status: "paid", polarProductId: productId });

    // A replayed fan-out event (order.updated) must not duplicate the entitlement.
    expect((await deliver({ ...paid, type: "order.updated" }, `wh-upd-${seq}`)).status).toBe(200);
    const all = await getDb().select().from(entitlements).where(eq(entitlements.userId, userId));
    expect(all).toHaveLength(1);
  });

  it("prefers the checkout metadata userId when the Polar email differs from the account", async () => {
    const { video, productId, userId } = await seedPublishedVideoAndBuyer();
    const res = await deliver(
      { type: "order.paid", data: { id: `ord-meta-${seq}`, status: "paid", product_id: productId, customer_email: "other@example.com", metadata: { userId } } },
      `wh-meta-${seq}`
    );
    expect(res.status).toBe(200);
    expect(await entitlementFor(userId, video.id)).toMatchObject({ isActive: true });
  });

  it("revokes the entitlement and marks the order refunded on order.refunded", async () => {
    const { video, productId, userId, email } = await seedPublishedVideoAndBuyer();
    const orderId = `ord-refund-${seq}`;
    await deliver({ type: "order.paid", data: { id: orderId, status: "paid", product_id: productId, customer_email: email } }, `wh-p-${seq}`);
    const res = await deliver(
      { type: "order.refunded", data: { id: orderId, status: "refunded", paid: true, product_id: productId, customer_email: email } },
      `wh-r-${seq}`
    );
    expect(res.status).toBe(200);
    expect(await entitlementFor(userId, video.id)).toMatchObject({ isActive: false });
    const [order] = await getDb().select().from(orders).where(eq(orders.polarOrderId, orderId));
    expect(order.status).toBe("refunded");
  });

  it("re-activates the entitlement when the buyer purchases again after a refund", async () => {
    const { video, productId, userId } = await seedPublishedVideoAndBuyer();
    const first = `ord-first-${seq}`;
    await deliver({ type: "order.paid", data: { id: first, status: "paid", product_id: productId, metadata: { userId } } }, `wh-f-${seq}`);
    await deliver({ type: "order.refunded", data: { id: first, status: "refunded", product_id: productId, metadata: { userId } } }, `wh-fr-${seq}`);
    expect(await entitlementFor(userId, video.id)).toMatchObject({ isActive: false });

    const second = `ord-second-${seq}`;
    const res = await deliver(
      { type: "order.paid", data: { id: second, status: "paid", product_id: productId, customer_email: "checkout-alias@example.com", metadata: { userId } } },
      `wh-s-${seq}`
    );
    expect(res.status).toBe(200);
    expect(await entitlementFor(userId, video.id)).toMatchObject({ isActive: true, validUntil: null });
  });

  it("does not re-grant access when a paid event for a refunded order arrives late", async () => {
    const { video, productId, userId, email } = await seedPublishedVideoAndBuyer();
    const orderId = `ord-late-${seq}`;
    const paid = { type: "order.paid", data: { id: orderId, status: "paid", product_id: productId, customer_email: email } };
    await deliver(paid, `wh-lp-${seq}`);
    await deliver({ type: "order.refunded", data: { id: orderId, status: "refunded", product_id: productId, customer_email: email } }, `wh-lr-${seq}`);

    // A retried delivery of the original paid event (new webhook id) after the refund.
    expect((await deliver(paid, `wh-lp-retry-${seq}`)).status).toBe(200);
    expect(await entitlementFor(userId, video.id)).toMatchObject({ isActive: false });
    const [order] = await getDb().select().from(orders).where(eq(orders.polarOrderId, orderId));
    expect(order.status).toBe("refunded");
  });

  it("keeps access after a partial refund", async () => {
    const { video, productId, userId, email } = await seedPublishedVideoAndBuyer();
    const orderId = `ord-partial-${seq}`;
    await deliver({ type: "order.paid", data: { id: orderId, status: "paid", product_id: productId, customer_email: email } }, `wh-pp-${seq}`);
    const res = await deliver(
      { type: "order.refunded", data: { id: orderId, status: "partially_refunded", product_id: productId, customer_email: email } },
      `wh-pr-${seq}`
    );
    expect(res.status).toBe(200);
    expect(await entitlementFor(userId, video.id)).toMatchObject({ isActive: true });
  });

  it("still skips products that are neither allowlisted nor course videos", async () => {
    const res = await deliver({ type: "order.paid", data: { id: "ord-foreign", product_id: "someone-elses-product" } }, "wh-foreign");
    expect(await res.json()).toEqual({ received: true, skipped: true });
    const stored = await getDb().select().from(webhookEvents).where(eq(webhookEvents.eventId, "wh-foreign"));
    expect(stored).toHaveLength(0);
  });
});
