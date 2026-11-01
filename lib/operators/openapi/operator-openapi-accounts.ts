/** OpenAPI paths of the account operator domains: users and organizations, membership, commerce (`/api/v1/operator`). */
import { ORDER_REFUND_REASONS } from "@/lib/commerce/order-refunds";
import { int, object, op, ref, str } from "./operator-openapi-shared";

const pathId = (name: string) => ({ name, in: "path", required: true, schema: str });
const limitParam = { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } };
const qParam = { name: "q", in: "query", schema: { type: "string", maxLength: 200 } };
const approvalId = { type: "string", description: "Approved, unconsumed approval requested by this operator for exactly these arguments" };
const time = { type: "string", format: "date-time" };
const nullableTime = { type: ["string", "null"], format: "date-time" };
const featureKey = { type: "string", pattern: "^(video|live:replay):[A-Za-z0-9_-]{1,100}$", description: "`video:<id>` or `live:replay:<eventId>`" };

export const accountPaths: Record<string, unknown> = {
  "/api/v1/operator/users": {
    get: op("Search accounts", "Newest first; `?q=` matches the id exactly or an email/name prefix. Needs `users:manage`.", {
      params: [qParam, limitParam],
      data: { type: "array", items: ref("OperatorUser") },
    }),
  },
  "/api/v1/operator/users/{id}": {
    get: op("Get an account", "With the effective membership tier, operator capabilities and organizations.", {
      params: [pathId("id")],
      data: ref("OperatorUserDetail"),
    }),
  },
  "/api/v1/operator/users/{id}/ban": {
    post: op(
      "Ban an account",
      "Sensitive (`users.user.ban`, target `{ userId, reason, expiresAt }`): every credential is refused at the next check and open sessions end. `expiresAt` null bans without an end. `cannot_ban_self` (409).",
      {
        params: [pathId("id")],
        body: object({ reason: { type: "string", maxLength: 500 }, expiresAt: nullableTime, approvalId }, ["reason", "expiresAt", "approvalId"]),
        data: ref("OperatorUser"),
      }
    ),
  },
  "/api/v1/operator/users/{id}/unban": {
    post: op("Lift a ban", "No approval needed; the audit row records the operator.", { params: [pathId("id")], data: ref("OperatorUser") }),
  },
  "/api/v1/operator/users/orgs": {
    get: op("Search organizations", "Newest first; `?q=` matches a slug or name prefix.", { params: [qParam, limitParam] }),
  },
  "/api/v1/operator/users/orgs/{id}": {
    get: op("Get an organization", "With its members and their roles.", { params: [pathId("id")] }),
  },
  "/api/v1/operator/membership/users/{userId}": {
    get: op(
      "Get a user's access",
      "Effective membership tier, entitlements written by purchases, and manual grants (revoked ones included). Needs `membership:manage`.",
      { params: [pathId("userId")] }
    ),
  },
  "/api/v1/operator/membership/resync": {
    post: op("Resync memberships from Polar", "Re-reads live membership subscriptions (oldest-synced first) and queues access reconciles for changed users.", {
      body: object({ limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }),
      data: object({ checked: int, changed: int, failed: int, driftEnqueued: int }),
    }),
  },
  "/api/v1/operator/membership/grants": {
    post: op(
      "Grant an entitlement by hand",
      "Sensitive (`membership.entitlement.grant`, target `{ userId, featureKey, validUntil }`). Stored as a grant, never as an order or purchase, so refunds and grants never cancel each other. `grant_exists` (409) while a live grant for the key exists.",
      {
        body: object({ userId: str, featureKey, validUntil: nullableTime, reason: { type: "string", maxLength: 500 }, approvalId }, ["userId", "featureKey", "validUntil", "reason", "approvalId"]),
        status: "201",
        data: ref("OperatorEntitlementGrant"),
      }
    ),
  },
  "/api/v1/operator/membership/grants/{id}/revoke": {
    post: op("Revoke a manual grant", "Sensitive (`membership.entitlement.revoke`, target `{ grantId }`). The row stays as history. `grant_revoked` (409).", {
      params: [pathId("id")],
      body: object({ approvalId }, ["approvalId"]),
      data: ref("OperatorEntitlementGrant"),
    }),
  },
  "/api/v1/operator/commerce/orders": {
    get: op("List orders", "Stored Polar orders, newest first; `?userId=`, `?status=`. Needs `commerce:manage`.", {
      params: [{ name: "userId", in: "query", schema: str }, { name: "status", in: "query", schema: str }, limitParam],
      data: { type: "array", items: ref("OperatorOrder") },
    }),
  },
  "/api/v1/operator/commerce/orders/{id}": {
    get: op("Get an order", "With the customer email and linked user.", { params: [pathId("id")], data: ref("OperatorOrder") }),
  },
  "/api/v1/operator/commerce/orders/{id}/refund": {
    post: op(
      "Refund an order through Polar",
      "Sensitive (`commerce.order.refund`, target `{ orderId, reason, amount }`; `amount` null refunds everything still refundable; the approval also binds the stored Polar order id and currency). Answers 202: Polar's `order.refunded` webhook updates the order and revokes what it paid for. `already_refunded`, `refund_amount_too_high` (409), `refund_failed` (502).",
      {
        params: [pathId("id")],
        body: object(
          { reason: { type: "string", enum: [...ORDER_REFUND_REASONS] }, amount: { type: ["integer", "null"], minimum: 1 }, comment: { type: "string", maxLength: 500 }, approvalId },
          ["reason", "amount", "approvalId"]
        ),
        status: "202",
        data: object({ orderId: str, refundId: str, refundStatus: str, amount: int, currency: str, orderStatus: str }),
      }
    ),
  },
  "/api/v1/operator/commerce/subscriptions": {
    get: op("List subscriptions", "Stored Polar subscriptions, newest first; `?userId=`, `?customerId=`, `?status=`.", {
      params: [{ name: "userId", in: "query", schema: str }, { name: "customerId", in: "query", schema: str }, { name: "status", in: "query", schema: str }, limitParam],
      data: { type: "array", items: ref("OperatorSubscription") },
    }),
  },
  "/api/v1/operator/commerce/subscriptions/{id}": {
    get: op("Get a subscription", "With the linked user.", { params: [pathId("id")], data: ref("OperatorSubscription") }),
  },
  "/api/v1/operator/commerce/subscriptions/{id}/cancel": {
    post: op(
      "Cancel a subscription at period end",
      "Asks Polar to end the subscription when the current period ends and stores the state Polar answers with; access lasts until then. `subscription_ended`, `already_canceling` (409), `subscription_update_failed` (502).",
      { params: [pathId("id")], data: ref("OperatorSubscription") }
    ),
  },
  "/api/v1/operator/commerce/subscriptions/{id}/resume": {
    post: op("Resume a subscription", "Undoes a pending cancel through Polar. `subscription_ended`, `not_canceling` (409), `subscription_update_failed` (502).", {
      params: [pathId("id")],
      data: ref("OperatorSubscription"),
    }),
  },
  "/api/v1/operator/commerce/customers": {
    get: op("List customers", "Polar customers, newest first; `?userId=` only, so no email travels in a URL.", {
      params: [{ name: "userId", in: "query", schema: str }, limitParam],
    }),
  },
  "/api/v1/operator/commerce/customers/{id}": {
    get: op("Get a customer", "With their stored orders and subscriptions.", { params: [pathId("id")] }),
  },
  "/api/v1/operator/membership/entitlements": {
    get: op("List purchased entitlements", "Newest first; `?userId=`, `?featureKey=`, `?all=true` includes inactive ones. Manual grants are on `…/membership/users/{userId}`.", {
      params: [
        { name: "userId", in: "query", schema: str },
        { name: "featureKey", in: "query", schema: str },
        { name: "all", in: "query", schema: { type: "string", enum: ["true", "false"] } },
        limitParam,
      ],
    }),
  },
  "/api/v1/operator/commerce/webhooks": {
    get: op("List problem webhook deliveries", "Polar deliveries that failed (`?status=failed`, default) or are unprocessed (`pending`). Payloads are never returned.", {
      params: [{ name: "status", in: "query", schema: { type: "string", enum: ["failed", "pending"], default: "failed" } }, limitParam],
    }),
  },
};

const userProperties = {
  id: str, name: str, email: str, emailVerified: { type: "boolean" }, role: { type: ["string", "null"] },
  banned: { type: ["boolean", "null"] }, banReason: { type: ["string", "null"] }, banExpires: nullableTime, createdAt: time,
};

export const accountSchemas: Record<string, unknown> = {
  OperatorUser: { type: "object", properties: userProperties },
  OperatorUserDetail: {
    type: "object",
    properties: {
      ...userProperties,
      membership: { type: "object", additionalProperties: true },
      capabilities: { type: "array", items: str },
      organizations: { type: "array", items: object({ orgId: str, name: str, slug: str, role: str }) },
    },
  },
  OperatorEntitlementGrant: {
    type: "object",
    properties: {
      id: str, userId: str, featureKey: str, reason: str, grantedBy: str, approvalId: str,
      validUntil: nullableTime, revokedAt: nullableTime, revokedBy: { type: ["string", "null"] }, createdAt: time,
    },
  },
  OperatorOrder: {
    type: "object",
    properties: {
      id: str, polarOrderId: str, polarProductId: str, productName: str, amount: { type: "string", description: "Minor units, as stored from Polar" }, currency: str, status: str,
      paidAt: nullableTime, createdAt: time, customerEmail: str, customerUserId: { type: ["string", "null"] },
    },
  },
  OperatorSubscription: {
    type: "object",
    properties: {
      id: str, polarSubscriptionId: str, polarProductId: str, productName: str, status: str, currentPeriodStart: nullableTime, currentPeriodEnd: nullableTime,
      cancelAtPeriodEnd: { type: ["boolean", "null"] }, pastDueSince: nullableTime, endedAt: nullableTime, customerId: str, customerUserId: { type: ["string", "null"] },
      createdAt: time, updatedAt: time,
    },
  },
};
