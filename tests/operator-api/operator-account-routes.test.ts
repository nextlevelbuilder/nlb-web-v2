import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);

const polarFake = vi.hoisted(() => ({
  orders: { get: vi.fn() },
  refunds: { create: vi.fn() },
  subscriptions: { get: vi.fn() },
}));
vi.mock("@/lib/polar", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/polar")>()), polar: polarFake }));

import { getDb } from "@/lib/db";
import { courseVideos, customers, entitlements, operatorAuditLogs, orders, organizations, members, sessions, users, webhookEvents } from "@/lib/db/schema";
import { canWatchVideo } from "@/lib/courses/course-video-access";
import { GET as searchUsers } from "@/app/api/v1/operator/users/route";
import { GET as getUser } from "@/app/api/v1/operator/users/[id]/route";
import { POST as banUser } from "@/app/api/v1/operator/users/[id]/ban/route";
import { POST as unbanUser } from "@/app/api/v1/operator/users/[id]/unban/route";
import { GET as searchOrgs } from "@/app/api/v1/operator/users/orgs/route";
import { GET as getOrg } from "@/app/api/v1/operator/users/orgs/[id]/route";
import { GET as userAccess } from "@/app/api/v1/operator/membership/users/[userId]/route";
import { POST as grantEntitlement } from "@/app/api/v1/operator/membership/grants/route";
import { POST as revokeGrant } from "@/app/api/v1/operator/membership/grants/[id]/revoke/route";
import { GET as listOrders } from "@/app/api/v1/operator/commerce/orders/route";
import { GET as getOrder } from "@/app/api/v1/operator/commerce/orders/[id]/route";
import { POST as refundOrder } from "@/app/api/v1/operator/commerce/orders/[id]/refund/route";
import { GET as listWebhooks } from "@/app/api/v1/operator/commerce/webhooks/route";
import { asCaller, getRequest, jsonRequest, nextSeq, params, readJson, seedOperator, seedUser, setCaller } from "../live-api/live-api-fixtures";
import { approvedBy, requestVia } from "./operator-api-fixtures";

const auditRows = (actorUserId: string, action: string) =>
  getDb().select().from(operatorAuditLogs).where(and(eq(operatorAuditLogs.actorUserId, actorUserId), eq(operatorAuditLogs.action, action)));

async function seedVideo() {
  const n = nextSeq();
  const [video] = await getDb().insert(courseVideos).values({ slug: `grant-video-${n}`, title: "Grant video", priceCents: 1900 }).returning();
  return video;
}

async function seedOrder(userId: string | null, status = "paid") {
  const n = nextSeq();
  const [customer] = await getDb().insert(customers).values({ email: `buyer${n}@example.com`, userId }).returning();
  const [order] = await getDb()
    .insert(orders)
    .values({ customerId: customer.id, polarOrderId: `polar-order-${n}`, polarProductId: `polar-product-${n}`, productName: "Video", amount: "1900", currency: "usd", status })
    .returning();
  return order;
}

beforeEach(() => {
  setCaller(null);
  polarFake.orders.get.mockReset();
  polarFake.refunds.create.mockReset();
});

describe("account operators: access", () => {
  it("refuses members, operators of another domain and API keys, and audits each deny", async () => {
    const member = await seedUser("member");
    const commerceOperator = await seedOperator(["commerce:manage"]);
    const keyOperator = await seedOperator(["users:manage"]);
    expect((await searchUsers(getRequest("/api/v1/operator/users"))).status).toBe(401);

    const cases: [typeof member, "session" | "api_key", string][] = [
      [member, "session", "not_operator"],
      [commerceOperator, "session", "missing_capability"],
      [keyOperator, "api_key", "credential_not_allowed"],
    ];
    for (const [user, authType, code] of cases) {
      setCaller(asCaller(user, authType));
      const response = await banUser(jsonRequest(`/api/v1/operator/users/${member.id}/ban`, "POST", { junk: true }), params({ id: member.id }));
      expect(response.status).toBe(403);
      expect((await readJson(response)).error?.code).toBe(code);
      expect(await auditRows(user.id, "users.user.ban")).toMatchObject([{ decision: "deny", reason: code, resource: "operator:users" }]);
    }

    // A users operator still cannot reach membership or commerce.
    setCaller(asCaller(keyOperator, "session"));
    expect((await grantEntitlement(jsonRequest("/api/v1/operator/membership/grants", "POST", {}))).status).toBe(403);
    expect((await listOrders(getRequest("/api/v1/operator/commerce/orders"))).status).toBe(403);
  });
});

describe("account operators: users and organizations", () => {
  it("searches and reads accounts and organizations", async () => {
    const operator = await seedOperator(["users:manage"]);
    const target = await seedUser("findme");
    const orgId = `org-acc-${nextSeq()}`;
    await getDb().insert(organizations).values({ id: orgId, name: "Acme", slug: orgId });
    await getDb().insert(members).values({ id: `member-${nextSeq()}`, organizationId: orgId, userId: target.id, role: "owner" });
    setCaller(asCaller(operator, "session"));

    const found = await readJson(await searchUsers(getRequest(`/api/v1/operator/users?q=${encodeURIComponent(target.email)}`)));
    expect(found.data).toEqual([expect.objectContaining({ id: target.id, email: target.email, banned: false })]);
    // The search term never reaches the audit row.
    const [listRow] = await auditRows(operator.id, "users.user.list");
    expect(JSON.stringify(listRow)).not.toContain(target.email);

    const detail = await readJson(await getUser(getRequest(`/api/v1/operator/users/${target.id}`), params({ id: target.id })));
    expect(detail.data).toMatchObject({ id: target.id, capabilities: [], organizations: [{ orgId, role: "owner" }], membership: expect.any(Object) });
    expect((await getUser(getRequest("/api/v1/operator/users/missing"), params({ id: "missing" }))).status).toBe(404);

    const orgs = await readJson(await searchOrgs(getRequest(`/api/v1/operator/users/orgs?q=${orgId}`)));
    expect(orgs.data).toEqual([expect.objectContaining({ id: orgId })]);
    const org = await readJson(await getOrg(getRequest(`/api/v1/operator/users/orgs/${orgId}`), params({ id: orgId })));
    expect(org.data.members).toEqual([expect.objectContaining({ userId: target.id, role: "owner" })]);
  });

  it("bans only with an approval bound to the reason and end, ends sessions, and unbans", async () => {
    const requester = await seedOperator(["users:manage"]);
    const approver = await seedOperator(["users:manage"]);
    const target = await seedUser("banned");
    await getDb().insert(sessions).values({ id: `session-${nextSeq()}`, userId: target.id, token: `token-${nextSeq()}`, expiresAt: new Date(Date.now() + 3_600_000) });
    const path = `/api/v1/operator/users/${target.id}/ban`;
    const ban = (body: Record<string, unknown>) => banUser(jsonRequest(path, "POST", body), params({ id: target.id }));

    setCaller(asCaller(requester, "session"));
    expect((await readJson(await ban({ reason: "Spam", expiresAt: null, approvalId: "nope" }))).error?.code).toBe("approval_not_found");
    // Operators never ban themselves, approval or not.
    const self = await banUser(jsonRequest(`/api/v1/operator/users/${requester.id}/ban`, "POST", { reason: "x", expiresAt: null, approvalId: "nope" }), params({ id: requester.id }));
    expect((await readJson(self)).error?.code).toBe("cannot_ban_self");

    const approvalId = await approvedBy(requester, approver, "users", "users.user.ban", { userId: target.id, reason: "Spam", expiresAt: null });
    // The approved reason is part of the hash: a different reason is refused.
    expect((await readJson(await ban({ reason: "Other", expiresAt: null, approvalId }))).error?.code).toBe("approval_mismatch");
    const banned = await ban({ reason: "Spam", expiresAt: null, approvalId });
    expect(banned.status).toBe(200);
    expect((await readJson(banned)).data).toMatchObject({ id: target.id, banned: true, banReason: "Spam" });
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, target.id))).toEqual([]);
    expect(await auditRows(requester.id, "users.user.ban")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `user:${target.id}`, approvalId })])
    );

    const unbanned = await unbanUser(jsonRequest(`/api/v1/operator/users/${target.id}/unban`, "POST"), params({ id: target.id }));
    expect((await readJson(unbanned)).data).toMatchObject({ banned: false, banReason: null });
  });
});

describe("account operators: membership grants", () => {
  it("grants a video by hand without an order, unlocks watching, and revokes it", async () => {
    const requester = await seedOperator(["membership:manage"]);
    const approver = await seedOperator(["membership:manage"]);
    const member = await seedUser("granted");
    const video = await seedVideo();
    const featureKey = `video:${video.id}`;
    const target = { userId: member.id, featureKey, validUntil: null };
    const db = getDb();
    expect(await canWatchVideo(member.id, video, db, { accessPlans: [] })).toBe(false);

    setCaller(asCaller(requester, "session"));
    expect(await requestVia(requester, "membership", "membership.entitlement.grant", { ...target, featureKey: "membership:vip" }, 400)).toBe("validation_failed");
    const approvalId = await approvedBy(requester, approver, "membership", "membership.entitlement.grant", target);
    const granted = await grantEntitlement(jsonRequest("/api/v1/operator/membership/grants", "POST", { ...target, reason: "Support ticket", approvalId }));
    expect(granted.status).toBe(201);
    const grant = (await readJson(granted)).data as { id: string };
    expect(grant).toMatchObject({ userId: member.id, featureKey, grantedBy: requester.id, approvalId, revokedAt: null });
    expect(await canWatchVideo(member.id, video, db, { accessPlans: [] })).toBe(true);
    // A manual grant never masquerades as a payment.
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, member.id))).toEqual([]);
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, member.id));
    expect(await db.select().from(customers).where(eq(customers.email, user.email))).toEqual([]);

    const second = await approvedBy(requester, approver, "membership", "membership.entitlement.grant", target);
    const duplicate = await grantEntitlement(jsonRequest("/api/v1/operator/membership/grants", "POST", { ...target, reason: "Again", approvalId: second }));
    expect((await readJson(duplicate)).error?.code).toBe("grant_exists");

    const access = await readJson(await userAccess(getRequest(`/api/v1/operator/membership/users/${member.id}`), params({ userId: member.id })));
    expect(access.data).toMatchObject({ userId: member.id, entitlements: [], grants: [expect.objectContaining({ id: grant.id })] });

    const revokePath = `/api/v1/operator/membership/grants/${grant.id}/revoke`;
    const revokeApproval = await approvedBy(requester, approver, "membership", "membership.entitlement.revoke", { grantId: grant.id });
    const revoked = await revokeGrant(jsonRequest(revokePath, "POST", { approvalId: revokeApproval }), params({ id: grant.id }));
    expect((await readJson(revoked)).data).toMatchObject({ id: grant.id, revokedBy: requester.id });
    expect(await canWatchVideo(member.id, video, db, { accessPlans: [] })).toBe(false);

    const again = await approvedBy(requester, approver, "membership", "membership.entitlement.revoke", { grantId: grant.id });
    expect((await readJson(await revokeGrant(jsonRequest(revokePath, "POST", { approvalId: again }), params({ id: grant.id })))).error?.code).toBe("grant_revoked");
  });
});

describe("account operators: commerce", () => {
  it("lists and reads orders and refunds through Polar only with an approval for the exact amount", async () => {
    const requester = await seedOperator(["commerce:manage"]);
    const approver = await seedOperator(["commerce:manage"]);
    const buyer = await seedUser("buyer");
    const order = await seedOrder(buyer.id);
    setCaller(asCaller(requester, "session"));

    const listed = await readJson(await listOrders(getRequest(`/api/v1/operator/commerce/orders?userId=${buyer.id}`)));
    expect(listed.data).toEqual([expect.objectContaining({ id: order.id, customerUserId: buyer.id, status: "paid" })]);
    const read = await readJson(await getOrder(getRequest(`/api/v1/operator/commerce/orders/${order.id}`), params({ id: order.id })));
    expect(read.data).toMatchObject({ id: order.id, polarOrderId: order.polarOrderId });

    polarFake.orders.get.mockResolvedValue({ id: order.polarOrderId, netAmount: 1900, refundedAmount: 0, currency: "usd" });
    polarFake.refunds.create.mockResolvedValue({ id: "refund-1", status: "pending", amount: 900, currency: "usd" });
    const refundPath = `/api/v1/operator/commerce/orders/${order.id}/refund`;
    const refund = (body: Record<string, unknown>) => refundOrder(jsonRequest(refundPath, "POST", body), params({ id: order.id }));

    const approvalId = await approvedBy(requester, approver, "commerce", "commerce.order.refund", { orderId: order.id, reason: "customer_request", amount: 900 });
    expect((await readJson(await refund({ reason: "customer_request", amount: 1900, approvalId }))).error?.code).toBe("approval_mismatch");
    expect(polarFake.refunds.create).not.toHaveBeenCalled();

    const accepted = await refund({ reason: "customer_request", amount: 900, approvalId });
    expect(accepted.status).toBe(202);
    expect((await readJson(accepted)).data).toMatchObject({ orderId: order.id, refundId: "refund-1", amount: 900, orderStatus: "paid" });
    expect(polarFake.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: order.polarOrderId, amount: 900, reason: "customer_request", metadata: { kind: "operator_refund", orderId: order.id } })
    );
    // The local order changes only when Polar's webhook confirms the refund.
    const [stored] = await getDb().select().from(orders).where(eq(orders.id, order.id));
    expect(stored.status).toBe("paid");
    expect((await readJson(await refund({ reason: "customer_request", amount: 900, approvalId }))).error?.code).toBe("approval_already_used");
    expect(polarFake.refunds.create).toHaveBeenCalledTimes(1);
  });

  it("lists failed webhook deliveries without their payloads", async () => {
    const operator = await seedOperator(["commerce:manage"]);
    const eventId = `evt-${nextSeq()}`;
    await getDb().insert(webhookEvents).values({ eventId, eventType: "order.paid", payload: { customer: { email: "secret@example.com" } }, processed: false, error: "boom" });
    setCaller(asCaller(operator, "session"));

    const response = await listWebhooks(getRequest("/api/v1/operator/commerce/webhooks?status=failed"));
    const body = await readJson(response);
    expect(body.data).toEqual(expect.arrayContaining([expect.objectContaining({ eventId, error: "boom" })]));
    expect(JSON.stringify(body)).not.toContain("secret@example.com");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
