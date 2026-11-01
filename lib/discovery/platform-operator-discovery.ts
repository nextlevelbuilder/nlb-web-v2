/**
 * Platform operator tools on the MCP server card. They wrap `/api/v1/operator/*` and need the
 * `mcp:operator` scope plus the matching `<domain>:manage` grant, which the web checks on every call.
 * The names mirror packages/mcp/src/tools/platform-operator.ts (asserted by tests).
 */
export const PLATFORM_OPERATOR_MCP_TOOLS = [
  "operator_commerce_list_orders",
  "operator_commerce_get_order",
  "operator_commerce_list_subscriptions",
  "operator_commerce_get_subscription",
  "operator_commerce_cancel_subscription",
  "operator_commerce_resume_subscription",
  "operator_commerce_list_customers",
  "operator_commerce_get_customer",
  "operator_commerce_list_webhook_failures",
  "operator_commerce_refund_order",
  "operator_users_list",
  "operator_users_get",
  "operator_users_list_orgs",
  "operator_users_get_org",
  "operator_membership_list_entitlements",
  "operator_membership_get_user_access",
  "operator_directory_list_products",
  "operator_directory_get_product",
  "operator_directory_list_moderation",
  "operator_approvals_list",
  "operator_approvals_get",
  "operator_approvals_request",
  "operator_approvals_decide",
] as const;

export function platformOperatorDiscovery() {
  return {
    scope: "mcp:operator",
    audience: "Platform operators: each tool also needs the grant of its domain (commerce:manage, users:manage, membership:manage or directory:manage), checked by the web on every call. Members never receive the scope; API keys are refused.",
    approvals: "Order refunds need an approval for the exact order, reason and amount, decided by a second operator and usable once.",
    audit: "Every call, allowed or denied, is written to the operator audit trail.",
    tools: [...PLATFORM_OPERATOR_MCP_TOOLS],
  };
}
