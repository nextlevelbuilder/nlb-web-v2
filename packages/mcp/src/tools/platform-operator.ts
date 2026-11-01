import type { McpToolDefinition, resolveToolEnv } from "./index.js";
import { bodyOf, idProp, limitProp, operatorSchema as schema, operatorToolFactory, pathId } from "./operator-http.js";

type ResolveToolEnv = typeof resolveToolEnv;

const OP = "/api/v1/operator";

/** OAuth (mcp:operator) or an operator session cookie; the web checks `<domain>:manage` on every call. */
const authNote = (capability: string) =>
  `Platform operator with the ${capability} grant only: OAuth with the mcp:operator scope (offered only to operators at consent) or an operator's session cookie. API keys are refused and every call is audited.`;

const REFUND_REASONS = ["duplicate", "fraudulent", "customer_request", "service_disruption", "satisfaction_guarantee", "other"] as const;
const APPROVAL_STATUSES = ["pending", "approved", "rejected", "consumed", "expired"] as const;
/** Domains whose sensitive actions are approved through `/api/v1/operator/approvals?domain=`. */
const APPROVAL_DOMAINS = ["commerce", "users", "membership"] as const;
/** Sensitive actions an agent may request an approval for: only those a tool here can then run. */
const REQUESTABLE_ACTIONS = ["commerce.order.refund"] as const;

const statusFilter = { type: "string", minLength: 1, maxLength: 50, description: "Exact status" };
const searchProp = (description: string) => ({ type: "string", minLength: 1, maxLength: 200, description });
const domainProp = { type: "string", enum: [...APPROVAL_DOMAINS], description: "Domain of the approval; decides which <domain>:manage grant the caller needs" };

/**
 * Builds the platform operator tools over `/api/v1/operator/*` (scope `mcp:operator`): commerce, users,
 * membership and directory reads, plus the order refund behind a two-person approval. Distinct from the
 * public directory tools (`list_products`), which show only published listings. The web is the authority:
 * it checks the domain grant, audits every call, binds approvals to the exact target and calls Polar.
 */
export function createPlatformOperatorTools(resolveEnv: ResolveToolEnv): McpToolDefinition[] {
  const tool = (capability: string, label: string) => operatorToolFactory({ label, capability }, resolveEnv, authNote(capability));
  const commerce = tool("commerce:manage", "NLB commerce operator API");
  const users = tool("users:manage", "NLB users operator API");
  const membership = tool("membership:manage", "NLB membership operator API");
  const directory = tool("directory:manage", "NLB directory operator API");
  const approvals = operatorToolFactory(
    { label: "NLB operator approvals API", capability: "<domain>:manage" },
    resolveEnv,
    "Platform operator with the <domain>:manage grant of the given domain only: OAuth with the mcp:operator scope or an operator's session cookie. API keys are refused and every call is audited."
  );

  return [
    // --- Commerce (Polar orders stored by the web) ---
    commerce("operator_commerce_list_orders", "List stored Polar orders newest first, optionally of one user or status.",
      schema({ user_id: idProp("Only orders of this user"), status: statusFilter, limit: limitProp() }),
      (a) => ({ method: "GET", path: `${OP}/commerce/orders`, query: { userId: a.user_id as string | undefined, status: a.status as string | undefined, limit: a.limit as number | undefined } })),
    commerce("operator_commerce_get_order", "Get one stored Polar order with its customer's email and user id.",
      schema({ order_id: idProp("Order id") }, ["order_id"]),
      (a) => ({ method: "GET", path: `${OP}/commerce/orders/${pathId(a.order_id)}`, resource: true })),
    commerce("operator_commerce_list_webhook_failures", "List Polar webhook deliveries that failed (default) or are still pending. No payloads.",
      schema({ status: { type: "string", enum: ["failed", "pending"] }, limit: limitProp() }),
      (a) => ({ method: "GET", path: `${OP}/commerce/webhooks`, query: { status: a.status as string | undefined, limit: a.limit as number | undefined } })),
    commerce("operator_commerce_refund_order",
      "Ask Polar to refund an order (answers 202); Polar's order.refunded webhook then updates the order and revokes what it paid for. Sensitive: needs approvalId of an approval another operator approved for exactly { orderId, reason, amount } (operator_approvals_request with action commerce.order.refund, then operator_approvals_decide by a second operator). Approvals are single-use, so a retry cannot refund twice. Without it the API answers 409 approval_required.",
      schema({
        order_id: idProp("Order id"),
        approvalId: idProp("Id of the approved approval for this exact order, reason and amount"),
        reason: { type: "string", enum: [...REFUND_REASONS] },
        amount: { type: ["integer", "null"], minimum: 1, description: "Minor units to refund; null refunds everything still refundable. Must equal the approved amount." },
        comment: { type: "string", maxLength: 500 }
      }, ["order_id", "approvalId", "reason", "amount"]),
      (a) => ({ method: "POST", path: `${OP}/commerce/orders/${pathId(a.order_id)}/refund`, body: bodyOf(a, "order_id"), resource: true })),

    // --- Users and organizations ---
    users("operator_users_list", "List accounts newest first; q matches the id exactly or an email or name prefix.",
      schema({ q: searchProp("User id, or email or name prefix"), limit: limitProp() }),
      (a) => ({ method: "GET", path: `${OP}/users`, query: { q: a.q as string | undefined, limit: a.limit as number | undefined } })),
    users("operator_users_get", "Get one account with its ban state, effective membership tier, operator capabilities and organizations.",
      schema({ user_id: idProp("User id") }, ["user_id"]),
      (a) => ({ method: "GET", path: `${OP}/users/${pathId(a.user_id)}`, resource: true })),
    users("operator_users_list_orgs", "List organizations newest first; q matches a slug or name prefix.",
      schema({ q: searchProp("Slug or name prefix"), limit: limitProp() }),
      (a) => ({ method: "GET", path: `${OP}/users/orgs`, query: { q: a.q as string | undefined, limit: a.limit as number | undefined } })),
    users("operator_users_get_org", "Get one organization with its members and their roles.",
      schema({ org_id: idProp("Organization id") }, ["org_id"]),
      (a) => ({ method: "GET", path: `${OP}/users/orgs/${pathId(a.org_id)}`, resource: true })),

    // --- Membership ---
    membership("operator_membership_list_entitlements", "What a user can reach: effective membership tier, entitlements written by purchases and manual grants (revoked ones included), kept apart so a grant never reads as a payment.",
      schema({ user_id: idProp("User id") }, ["user_id"]),
      (a) => ({ method: "GET", path: `${OP}/membership/users/${pathId(a.user_id)}`, resource: true })),

    // --- Directory (platform management, every status) ---
    directory("operator_directory_list_products", "List directory products of every organization in any status (drafts, in review, rejected, published). Use list_products for the public, published catalog.",
      schema({ status: { type: "string", pattern: "^[a-z_]{1,40}$", description: "Exact product status" }, limit: limitProp() }),
      (a) => ({ method: "GET", path: `${OP}/directory/products`, query: { status: a.status as string | undefined, limit: a.limit as number | undefined } })),
    directory("operator_directory_list_moderation", "List the moderation queue, highest priority first (default in_review). Decisions are made by a named human on the website, never by an agent.",
      schema({ status: { type: "string", enum: ["open", "in_review", "decided"] }, limit: limitProp() }),
      (a) => ({ method: "GET", path: `${OP}/directory/moderation`, query: { status: a.status as string | undefined, limit: a.limit as number | undefined } })),

    // --- Two-person approvals of commerce, users and membership actions ---
    approvals("operator_approvals_list", "List two-person approvals of a domain newest first (default status pending), each with action, resource, canonical arguments, reason and requester. Keyset pagination: pass pagination.nextCursor as cursor.",
      schema({ domain: domainProp, status: { type: "string", enum: [...APPROVAL_STATUSES] }, limit: limitProp(), cursor: { type: "string", maxLength: 500 } }, ["domain"]),
      (a) => ({ method: "GET", path: `${OP}/approvals`, query: { domain: a.domain as string, status: a.status as string | undefined, limit: a.limit as number | undefined, cursor: a.cursor as string | undefined } })),
    approvals("operator_approvals_get", "Get one approval of a domain with the canonical arguments behind its hash and its effective status.",
      schema({ domain: domainProp, approval_id: idProp("Approval id") }, ["domain", "approval_id"]),
      (a) => ({ method: "GET", path: `${OP}/approvals/${pathId(a.approval_id)}`, query: { domain: a.domain as string }, resource: true })),
    approvals("operator_approvals_request", "Request a two-person approval for a sensitive action. For commerce.order.refund, target is { orderId, reason, amount } (amount in minor units, or null for everything refundable) and domain is commerce. A different operator must approve it; it is single-use and expires after ttlMinutes (default 30).",
      schema({
        domain: domainProp,
        action: { type: "string", enum: [...REQUESTABLE_ACTIONS] },
        target: { type: "object", description: "{ orderId, reason, amount } for commerce.order.refund" },
        reason: { type: "string", minLength: 1, maxLength: 500 },
        ttlMinutes: { type: "integer", minimum: 1, maximum: 1440, description: "Lifetime of the approval" }
      }, ["domain", "action", "target", "reason"]),
      (a) => ({ method: "POST", path: `${OP}/approvals`, query: { domain: a.domain as string }, body: bodyOf(a, "domain") })),
    approvals("operator_approvals_decide", "Approve or reject a pending approval of a domain. The decider must be a different operator holding the action's grant; self, expired and already decided approvals are refused (409).",
      schema({ domain: domainProp, approval_id: idProp("Approval id"), decision: { type: "string", enum: ["approve", "reject"] } }, ["domain", "approval_id", "decision"]),
      (a) => ({ method: "POST", path: `${OP}/approvals/${pathId(a.approval_id)}/decision`, query: { domain: a.domain as string }, body: bodyOf(a, "domain", "approval_id"), resource: true }))
  ];
}
