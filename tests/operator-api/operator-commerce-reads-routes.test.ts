import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);
vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: vi.fn().mockReturnValue(true),
  WebhookVerificationError: class WebhookVerificationError extends Error {},
}));
vi.mock("@/lib/resend", () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true, data: {} }) }));
vi.mock("@/lib/email-form01", () => ({ sendForm01Email: vi.fn().mockResolvedValue({ success: true, data: {} }) }));
vi.mock("@/lib/discord", () => ({ sendDiscordSalesNotification: vi.fn().mockResolvedValue(true) }));

const polarFake = vi.hoisted(() => ({
  orders: { get: vi.fn() },
  refunds: { create: vi.fn() },
  subscriptions: { get: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/polar", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/polar")>()), polar: polarFake }));

import { getDb } from "@/lib/db";
import {
  courseVideos,
  customers,
  entitlements,
  operatorAuditLogs,
  orders,
  organizations,
  productRevisions,
  products,
  subscriptions,
  submissions,
  webhookEvents,
} from "@/lib/db/schema";
import { revokeOperatorCapability } from "@/lib/operators/operator-grants";
import { GET as listSubscriptions } from "@/app/api/v1/operator/commerce/subscriptions/route";
import { GET as getSubscription } from "@/app/api/v1/operator/commerce/subscriptions/[id]/route";
import { POST as cancelSubscription } from "@/app/api/v1/operator/commerce/subscriptions/[id]/cancel/route";
import { POST as resumeSubscription } from "@/app/api/v1/operator/commerce/subscriptions/[id]/resume/route";
import { GET as listCustomers } from "@/app/api/v1/operator/commerce/customers/route";
import { GET as getCustomer } from "@/app/api/v1/operator/commerce/customers/[id]/route";
import { GET as listEntitlements } from "@/app/api/v1/operator/membership/entitlements/route";
import { GET as getProduct } from "@/app/api/v1/operator/directory/products/[id]/route";
import { POST as refundOrder } from "@/app/api/v1/operator/commerce/orders/[id]/refund/route";
import { POST as polarWebhook } from "@/app/api/webhooks/polar/route";
import { asCaller, getRequest, jsonRequest, nextSeq, params, readJson, seedOperator, seedUser, setCaller } from "../live-api/live-api-fixtures";
import { approveVia, approvedBy, requestVia } from "./operator-api-fixtures";

const auditRows = (actorUserId: string, action: string) =>
  getDb().select().from(operatorAuditLogs).where(and(eq(operatorAuditLogs.actorUserId, actorUserId), eq(operatorAuditLogs.action, action)));

async function seedCustomer(userId: string | null) {
  const n = nextSeq();
  const [customer] = await getDb().insert(customers).values({ email: `sub${n}@example.com`, userId }).returning();
  return customer;
}

async function seedSubscription(customerId: string, values: Partial<typeof subscriptions.$inferInsert> = {}) {
  const n = nextSeq();
  const [row] = await getDb()
    .insert(subscriptions)
    .values({
      customerId,
      polarSubscriptionId: `polar-sub-${n}`,
      polarProductId: `polar-product-${n}`,
      productName: "Premium",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      polarModifiedAt: new Date(Date.now() - 60_000),
      ...values,
    })
    .returning();
  return row;
}

/** What Polar answers `subscriptions.update` with: the same subscription, now (not) ending at period end. */
const polarAnswer = (row: typeof subscriptions.$inferSelect, cancelAtPeriodEnd: boolean) => ({
  id: row.polarSubscriptionId,
  status: row.status,
  productId: row.polarProductId,
  product: { name: row.productName },
  currentPeriodStart: row.currentPeriodStart,
  currentPeriodEnd: row.currentPeriodEnd,
  cancelAtPeriodEnd,
  endedAt: null,
  modifiedAt: new Date(),
});

beforeEach(() => {
  setCaller(null);
  for (const fn of [polarFake.orders.get, polarFake.refunds.create, polarFake.subscriptions.update]) fn.mockReset();
});

describe("commerce read operators: access", () => {
  it("keeps each domain apart and refuses an operator whose capability was revoked", async () => {
    const usersOperator = await seedOperator(["users:manage"]);
    const commerceOperator = await seedOperator(["commerce:manage"]);
    setCaller(asCaller(usersOperator, "session"));
    for (const response of [
      await listSubscriptions(getRequest("/api/v1/operator/commerce/subscriptions")),
      await listCustomers(getRequest("/api/v1/operator/commerce/customers")),
      await listEntitlements(getRequest("/api/v1/operator/membership/entitlements")),
      await getProduct(getRequest("/api/v1/operator/directory/products/any"), params({ id: "any" })),
    ]) {
      expect(response.status).toBe(403);
      expect((await readJson(response)).error?.code).toBe("missing_capability");
    }
    // A commerce operator cannot reach membership or the directory either.
    setCaller(asCaller(commerceOperator, "session"));
    expect((await listEntitlements(getRequest("/api/v1/operator/membership/entitlements"))).status).toBe(403);
    expect((await getProduct(getRequest("/api/v1/operator/directory/products/any"), params({ id: "any" }))).status).toBe(403);

    expect((await listSubscriptions(getRequest("/api/v1/operator/commerce/subscriptions"))).status).toBe(200);
    expect(await revokeOperatorCapability(getDb(), { userId: commerceOperator.id, capability: "commerce:manage" })).toBe(true);
    const revoked = await listSubscriptions(getRequest("/api/v1/operator/commerce/subscriptions"));
    expect(revoked.status).toBe(403);
    expect((await readJson(revoked)).error?.code).toBe("not_operator");
    expect(await auditRows(commerceOperator.id, "commerce.subscription.list")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow" }), expect.objectContaining({ decision: "deny", reason: "not_operator" })])
    );
  });
});

describe("commerce read operators: subscriptions and customers", () => {
  it("lists and reads subscriptions and customers without putting an email in the URL", async () => {
    const operator = await seedOperator(["commerce:manage"]);
    const member = await seedUser("subscriber");
    const customer = await seedCustomer(member.id);
    const subscription = await seedSubscription(customer.id);
    setCaller(asCaller(operator, "session"));

    const listed = await readJson(await listSubscriptions(getRequest(`/api/v1/operator/commerce/subscriptions?userId=${member.id}`)));
    expect(listed.data).toEqual([expect.objectContaining({ id: subscription.id, customerUserId: member.id, status: "active" })]);
    const byCustomer = await readJson(await listSubscriptions(getRequest(`/api/v1/operator/commerce/subscriptions?customerId=${customer.id}&status=canceled`)));
    expect(byCustomer.data).toEqual([]);
    const read = await readJson(await getSubscription(getRequest(`/api/v1/operator/commerce/subscriptions/${subscription.id}`), params({ id: subscription.id })));
    expect(read.data).toMatchObject({ id: subscription.id, polarSubscriptionId: subscription.polarSubscriptionId, customerUserId: member.id });
    expect((await getSubscription(getRequest("/api/v1/operator/commerce/subscriptions/missing"), params({ id: "missing" }))).status).toBe(404);

    const customersListed = await readJson(await listCustomers(getRequest(`/api/v1/operator/commerce/customers?userId=${member.id}`)));
    expect(customersListed.data).toEqual([expect.objectContaining({ id: customer.id, userId: member.id })]);
    const detail = await readJson(await getCustomer(getRequest(`/api/v1/operator/commerce/customers/${customer.id}`), params({ id: customer.id })));
    expect(detail.data).toMatchObject({ id: customer.id, orders: [], subscriptions: [expect.objectContaining({ id: subscription.id })] });
    expect((await getCustomer(getRequest("/api/v1/operator/commerce/customers/missing"), params({ id: "missing" }))).status).toBe(404);
    // Customers are found by user id only, so no email reaches a URL or an audit row.
    for (const row of await auditRows(operator.id, "commerce.customer.list")) expect(JSON.stringify(row)).not.toContain(customer.email);
  });

  it("cancels and resumes through Polar only, and changes nothing locally when Polar fails", async () => {
    const operator = await seedOperator(["commerce:manage"]);
    const member = await seedUser("canceller");
    const subscription = await seedSubscription((await seedCustomer(member.id)).id);
    const path = (action: string) => `/api/v1/operator/commerce/subscriptions/${subscription.id}/${action}`;
    const cancel = () => cancelSubscription(jsonRequest(path("cancel"), "POST"), params({ id: subscription.id }));
    const resume = () => resumeSubscription(jsonRequest(path("resume"), "POST"), params({ id: subscription.id }));
    const stored = async () => (await getDb().select().from(subscriptions).where(eq(subscriptions.id, subscription.id)))[0];
    setCaller(asCaller(operator, "session"));

    polarFake.subscriptions.update.mockRejectedValueOnce(new Error("polar down"));
    const failed = await cancel();
    expect(failed.status).toBe(502);
    expect((await readJson(failed)).error?.code).toBe("subscription_update_failed");
    expect((await stored()).cancelAtPeriodEnd).toBe(false);

    expect((await readJson(await resume())).error?.code).toBe("not_canceling");
    polarFake.subscriptions.update.mockResolvedValueOnce(polarAnswer(subscription, true));
    const canceled = await cancel();
    expect(canceled.status).toBe(200);
    expect((await readJson(canceled)).data).toMatchObject({ id: subscription.id, cancelAtPeriodEnd: true, status: "active" });
    expect(polarFake.subscriptions.update).toHaveBeenLastCalledWith({ id: subscription.polarSubscriptionId, subscriptionUpdate: { cancelAtPeriodEnd: true } });
    expect((await readJson(await cancel())).error?.code).toBe("already_canceling");

    polarFake.subscriptions.update.mockResolvedValueOnce(polarAnswer(subscription, false));
    expect((await readJson(await resume())).data).toMatchObject({ cancelAtPeriodEnd: false });
    expect(await auditRows(operator.id, "commerce.subscription.cancel")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `subscription:${subscription.id}` })])
    );

    const ended = await seedSubscription((await seedCustomer(member.id)).id, { status: "canceled", endedAt: new Date() });
    const endedResponse = await cancelSubscription(jsonRequest(`/api/v1/operator/commerce/subscriptions/${ended.id}/cancel`, "POST"), params({ id: ended.id }));
    expect((await readJson(endedResponse)).error?.code).toBe("subscription_ended");
    expect(polarFake.subscriptions.update).toHaveBeenCalledTimes(3);
  });
});

describe("commerce read operators: entitlements and directory products", () => {
  it("lists purchased entitlements, active only unless all=true", async () => {
    const operator = await seedOperator(["membership:manage"]);
    const member = await seedUser("entitled");
    const n = nextSeq();
    await getDb().insert(entitlements).values([
      { userId: member.id, featureKey: `video:active-${n}`, isActive: true },
      { userId: member.id, featureKey: `video:gone-${n}`, isActive: false },
    ]);
    setCaller(asCaller(operator, "session"));

    const active = await readJson(await listEntitlements(getRequest(`/api/v1/operator/membership/entitlements?userId=${member.id}`)));
    expect(active.data).toEqual([expect.objectContaining({ featureKey: `video:active-${n}` })]);
    const all = await readJson(await listEntitlements(getRequest(`/api/v1/operator/membership/entitlements?userId=${member.id}&all=true`)));
    expect((all.data as unknown[]).length).toBe(2);
    expect((await listEntitlements(getRequest("/api/v1/operator/membership/entitlements?all=yes"))).status).toBe(400);
  });

  it("reads one directory product with its revision and submissions", async () => {
    const operator = await seedOperator(["directory:manage"]);
    const n = nextSeq();
    const db = getDb();
    await db.insert(organizations).values({ id: `org-read-${n}`, name: "Org", slug: `org-read-${n}` });
    const [product] = await db
      .insert(products)
      .values({ orgId: `org-read-${n}`, slug: `read-${n}`, title: "Tool", tagline: "Does things", websiteUrl: "https://tool.example", status: "draft" })
      .returning();
    const [revision] = await db
      .insert(productRevisions)
      .values({ productId: product.id, contentHash: `hash-read-${n}`, title: "Tool", tagline: "Does things", description: "A tool", document: {}, createdBy: "maker" })
      .returning();
    await db.update(products).set({ currentRevisionId: revision.id }).where(eq(products.id, product.id));
    await db.insert(submissions).values({ productId: product.id, revisionId: revision.id, submitterId: "maker" });
    setCaller(asCaller(operator, "session"));

    const read = await readJson(await getProduct(getRequest(`/api/v1/operator/directory/products/${product.id}`), params({ id: product.id })));
    expect(read.data).toMatchObject({
      id: product.id,
      status: "draft",
      currentRevision: { id: revision.id },
      submissions: [expect.objectContaining({ revisionId: revision.id, caseId: null })],
    });
    expect((await getProduct(getRequest("/api/v1/operator/directory/products/missing"), params({ id: "missing" }))).status).toBe(404);
  });
});

describe("commerce read operators: refunds", () => {
  it("binds the Polar order and currency, refuses self-approval, mismatch and replay, and survives a duplicate webhook", async () => {
    const requester = await seedOperator(["commerce:manage"]);
    const approver = await seedOperator(["commerce:manage"]);
    const buyer = await seedUser("refunded");
    const n = nextSeq();
    const productId = `polar-course-refund-${n}`;
    const [video] = await getDb().insert(courseVideos).values({ slug: `refund-video-${n}`, title: "Refund video", priceCents: 1900, status: "published", polarProductId: productId }).returning();
    const customer = await seedCustomer(buyer.id);
    const [order] = await getDb()
      .insert(orders)
      .values({ customerId: customer.id, polarOrderId: `polar-refund-order-${n}`, polarProductId: productId, productName: "Video", amount: "1900", currency: "eur", status: "paid" })
      .returning();
    await getDb().insert(entitlements).values({ userId: buyer.id, featureKey: `video:${video.id}` });
    const target = { orderId: order.id, reason: "customer_request", amount: null };
    const refundPath = `/api/v1/operator/commerce/orders/${order.id}/refund`;
    const refund = (body: Record<string, unknown>) => refundOrder(jsonRequest(refundPath, "POST", body), params({ id: order.id }));

    // The requester can never decide their own approval.
    const selfId = await requestVia(requester, "commerce", "commerce.order.refund", target);
    expect((await approveVia(requester, "commerce", selfId, 409)).error?.code).toBe("approval_self_decision");

    const approvalId = await approvedBy(requester, approver, "commerce", "commerce.order.refund", target);
    expect((await readJson(await refund({ reason: "duplicate", amount: null, approvalId }))).error?.code).toBe("approval_mismatch");

    // Polar failing still consumes the approval: a retry needs a fresh decision.
    polarFake.orders.get.mockResolvedValue({ id: order.polarOrderId, netAmount: 1900, refundedAmount: 0, currency: "eur" });
    polarFake.refunds.create.mockRejectedValueOnce(new Error("polar down"));
    const failed = await refund({ reason: "customer_request", amount: null, approvalId });
    expect(failed.status).toBe(502);
    expect((await readJson(failed)).error?.code).toBe("refund_failed");
    expect((await readJson(await refund({ reason: "customer_request", amount: null, approvalId }))).error?.code).toBe("approval_already_used");

    // Changing the stored currency after approval invalidates it: the hash bound the old one.
    const second = await approvedBy(requester, approver, "commerce", "commerce.order.refund", target);
    await getDb().update(orders).set({ currency: "usd" }).where(eq(orders.id, order.id));
    expect((await readJson(await refund({ reason: "customer_request", amount: null, approvalId: second }))).error?.code).toBe("approval_mismatch");
    await getDb().update(orders).set({ currency: "eur" }).where(eq(orders.id, order.id));

    const third = await approvedBy(requester, approver, "commerce", "commerce.order.refund", target);
    polarFake.refunds.create.mockResolvedValueOnce({ id: `refund-${n}`, status: "pending", amount: 1900, currency: "eur" });
    expect((await refund({ reason: "customer_request", amount: null, approvalId: third })).status).toBe(202);
    expect(polarFake.refunds.create).toHaveBeenLastCalledWith(expect.objectContaining({ orderId: order.polarOrderId, amount: 1900 }));

    // Polar delivers order.refunded twice with the same webhook id: one stored event, one revocation.
    const refundedEvent = { type: "order.refunded", data: { id: order.polarOrderId, status: "refunded", product_id: productId, metadata: { userId: buyer.id } } };
    const deliver = () =>
      polarWebhook(
        new Request("https://nlb.test/api/webhooks/polar", {
          method: "POST",
          headers: { "webhook-id": `wh-op-refund-${n}`, "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
          body: JSON.stringify(refundedEvent),
        })
      );
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    expect(await getDb().select().from(webhookEvents).where(eq(webhookEvents.eventId, `wh-op-refund-${n}`))).toHaveLength(1);
    const [storedOrder] = await getDb().select().from(orders).where(eq(orders.id, order.id));
    expect(storedOrder.status).toBe("refunded");
    const rows = await getDb().select().from(entitlements).where(eq(entitlements.userId, buyer.id));
    expect(rows).toEqual([expect.objectContaining({ isActive: false })]);
  });
});
