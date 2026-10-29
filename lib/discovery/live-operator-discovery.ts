/**
 * NLB Live operator tools on the MCP server card. They wrap `/api/v1/live-admin/*` (kept out of the public
 * OpenAPI document while `PUBLISH_LIVE_OPENAPI` is false) and need the `mcp:operator` scope, which the
 * authorization server grants only to platform operators. The names mirror packages/mcp/src/tools/live-operator.ts (asserted by tests).
 */
export const LIVE_OPERATOR_MCP_TOOLS = [
  "live_admin_list_events",
  "live_admin_get_event",
  "live_admin_list_event_tickets",
  "live_admin_list_topic_groups",
  "live_admin_list_topics",
  "live_admin_list_rounds",
  "live_admin_list_approvals",
  "live_admin_get_approval",
  "live_admin_list_audit",
  "live_admin_get_metrics",
  "live_admin_create_topic_group",
  "live_admin_update_topic_group",
  "live_admin_archive_topic_group",
  "live_admin_create_topic",
  "live_admin_update_topic",
  "live_admin_archive_topic",
  "live_admin_create_round",
  "live_admin_finalize_round",
  "live_admin_override_round_winner",
  "live_admin_create_event",
  "live_admin_update_event",
  "live_admin_set_event_capacity",
  "live_admin_transition_event",
  "live_admin_create_event_product",
  "live_admin_open_event_sales",
  "live_admin_create_event_meeting",
  "live_admin_cancel_event",
  "live_admin_refund_ticket",
  "live_admin_request_approval",
  "live_admin_decide_approval",
  "live_admin_run_sweeps",
] as const;

export function liveOperatorDiscovery() {
  return {
    scope: "mcp:operator",
    audience: "Platform operators: the scope needs an unrevoked operator grant and the Live tools need live:manage. Members never receive the scope; API keys are refused.",
    approvals: "Ticket refunds, event cancellations and winner overrides need an approval decided by a second operator.",
    audit: "Every call, allowed or denied, is written to the operator audit trail.",
    tools: [...LIVE_OPERATOR_MCP_TOOLS],
  };
}
