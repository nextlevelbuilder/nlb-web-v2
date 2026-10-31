export const MCP_SCOPES = ["mcp:read", "mcp:write", "mcp:keys", "mcp:operator"] as const;
export type McpScope = typeof MCP_SCOPES[number];

/** Blog tools that mutate posts; they need mcp:write and an authorized caller. */
export const BLOG_WRITE_TOOLS = [
  "blog_create_post",
  "blog_update_post",
  "blog_publish_post",
  "blog_unpublish_post",
  "blog_archive_post",
  "blog_restore_revision"
] as const;

/** Course video admin tools (mcp:write); the web also requires the caller to be an admin. */
export const COURSE_ADMIN_TOOLS = [
  "course_create_upload",
  "course_get_upload",
  "course_create_video",
  "course_update_video",
  "course_publish_video",
  "course_set_transcript"
] as const;

/** Course reads bound to the caller's access (purchase or Premium/VIP), so they forward identity (mcp:read). */
export const COURSE_MEMBER_READ_TOOLS = ["course_get_transcript"] as const;

/**
 * Builder League writes (mcp:write). Every one of them is member self-service: none can verify,
 * approve or award, because API keys and MCP agents may only submit `self_reported` activity.
 */
export const BUILDER_WRITE_TOOLS = [
  "builder_create_project",
  "builder_submit_evidence",
  "builder_update_evidence",
  "builder_withdraw_evidence",
  "builder_appeal_evidence",
  "builder_join_season",
  "builder_save_time_capsule",
  "builder_request_year_video",
  "builder_revoke_share_link",
  "builder_admin_backfill_preview"
] as const;

/** Builder League reads: every one is bound to the caller's identity, so all are private reads (mcp:read). */
export const BUILDER_READ_TOOLS = [
  "builder_get_access",
  "builder_get_me",
  "builder_list_projects",
  "builder_list_evidence",
  "builder_get_evidence",
  "builder_get_journey",
  "builder_list_missions",
  "builder_list_badges",
  "builder_get_seasons",
  "builder_get_rankings",
  "builder_list_rewards",
  "builder_get_time_capsule",
  "builder_get_passport",
  "builder_get_year",
  "builder_list_share_links",
  "builder_list_year_videos",
  "builder_get_community_wrapped",
  "builder_admin_list_queue"
] as const;

/**
 * NLB Live operator reads (mcp:operator). The web grants the scope only to platform operators at consent
 * and still checks the live:manage grant on every call.
 */
export const LIVE_OPERATOR_READ_TOOLS = [
  "live_admin_list_events",
  "live_admin_get_event",
  "live_admin_list_event_tickets",
  "live_admin_list_topic_groups",
  "live_admin_list_topics",
  "live_admin_list_rounds",
  "live_admin_list_approvals",
  "live_admin_get_approval",
  "live_admin_list_audit",
  "live_admin_get_metrics"
] as const;

/** NLB Live operator writes (mcp:operator). Refunds, cancellations and winner overrides also need a second operator's approval. */
export const LIVE_OPERATOR_WRITE_TOOLS = [
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
  "live_admin_run_sweeps"
] as const;

/**
 * Affiliate member reads (mcp:read), bound to the caller's own affiliate account. The program overview
 * (affiliate_get_program) is public and therefore not listed here.
 */
export const AFFILIATE_MEMBER_READ_TOOLS = [
  "affiliate_get_me",
  "affiliate_preview_incentive",
  "affiliate_list_links",
  "affiliate_list_conversions",
  "affiliate_get_commissions",
  "affiliate_list_payouts"
] as const;

/** Affiliate member writes (mcp:write): owner-only self-service. Payout methods stay session-only on the website. */
export const AFFILIATE_MEMBER_WRITE_TOOLS = [
  "affiliate_join",
  "affiliate_create_link",
  "affiliate_update_link"
] as const;

/**
 * Affiliate finance operator reads and previews (mcp:operator). Previews never write. The web checks the
 * affiliate operator grant on every call.
 */
export const AFFILIATE_OPERATOR_READ_TOOLS = [
  "affiliate_admin_get_rules",
  "affiliate_admin_preview_rules",
  "affiliate_admin_list_affiliates",
  "affiliate_admin_list_conversions",
  "affiliate_admin_preview_payouts",
  "affiliate_admin_list_batches",
  "affiliate_admin_get_batch",
  "affiliate_admin_reconciliation",
  "affiliate_admin_list_approvals"
] as const;

/**
 * Affiliate operator writes (mcp:operator). None of them moves money out: publishing rules, approving
 * batches, marking items paid, revealing payee details and ledger adjustments are deliberately not tools.
 */
export const AFFILIATE_OPERATOR_WRITE_TOOLS = [
  "affiliate_admin_hold_conversion",
  "affiliate_admin_release_conversion",
  "affiliate_admin_create_batch",
  "affiliate_admin_cancel_batch"
] as const;

/** Operator reads of every domain: private, and advertised as read-only even when they POST a preview. */
export const OPERATOR_READ_TOOLS = [...LIVE_OPERATOR_READ_TOOLS, ...AFFILIATE_OPERATOR_READ_TOOLS] as const;
/** Operator writes of every domain (mcp:operator, mutating). */
export const OPERATOR_WRITE_TOOLS = [...LIVE_OPERATOR_WRITE_TOOLS, ...AFFILIATE_OPERATOR_WRITE_TOOLS] as const;

/** Reads that always need an identity (no anonymous fallback). */
export const PRIVATE_READ_TOOLS = [
  "get_product_traffic",
  "blog_list_revisions",
  "blog_get_revision",
  "onboarding_get_status",
  ...COURSE_MEMBER_READ_TOOLS,
  ...BUILDER_READ_TOOLS,
  ...AFFILIATE_MEMBER_READ_TOOLS,
  ...OPERATOR_READ_TOOLS
] as const;

/** Reads that are public anonymously but forward the caller's identity when present (e.g. admin draft access). */
export const IDENTITY_AWARE_READ_TOOLS = ["blog_list_posts", "blog_get_post"] as const;

export function requiredToolScope(name: string): McpScope {
  if (["list_api_keys", "create_api_key", "revoke_api_key"].includes(name)) return "mcp:keys";
  if (isOperatorTool(name)) return "mcp:operator";
  if (["submit_product", "cast_vote", "upload_media", "create_checkout", ...BLOG_WRITE_TOOLS, ...BUILDER_WRITE_TOOLS, ...COURSE_ADMIN_TOOLS, ...AFFILIATE_MEMBER_WRITE_TOOLS].includes(name)) return "mcp:write";
  return "mcp:read";
}

/**
 * Tools that mutate remote state: anonymous HTTP callers are refused before they run
 * (server.ts MUTATING_TOOLS). Builder League tools also refuse anonymous callers in their handlers.
 */
export function isMutatingTool(name: string): boolean {
  return ["submit_product", "cast_vote", "upload_media", "create_checkout", "create_api_key", "revoke_api_key"].includes(name) ||
    (BLOG_WRITE_TOOLS as readonly string[]).includes(name) ||
    (BUILDER_WRITE_TOOLS as readonly string[]).includes(name) ||
    (COURSE_ADMIN_TOOLS as readonly string[]).includes(name) ||
    (AFFILIATE_MEMBER_WRITE_TOOLS as readonly string[]).includes(name) ||
    (OPERATOR_WRITE_TOOLS as readonly string[]).includes(name);
}

export function isLiveOperatorTool(name: string): boolean {
  return (LIVE_OPERATOR_READ_TOOLS as readonly string[]).includes(name) || (LIVE_OPERATOR_WRITE_TOOLS as readonly string[]).includes(name);
}

/** Tools of any operator domain (NLB Live, affiliate finance): all need mcp:operator. */
export function isOperatorTool(name: string): boolean {
  return (OPERATOR_READ_TOOLS as readonly string[]).includes(name) || (OPERATOR_WRITE_TOOLS as readonly string[]).includes(name);
}

export function isPrivateReadTool(name: string): boolean {
  return (PRIVATE_READ_TOOLS as readonly string[]).includes(name);
}

export function isIdentityAwareReadTool(name: string): boolean {
  return (IDENTITY_AWARE_READ_TOOLS as readonly string[]).includes(name);
}

/** Tool failure with structured data (e.g. HTTP status, currentVersion, validation details) merged into the MCP error payload. */
export class ToolError extends Error {
  readonly data: Record<string, unknown>;

  constructor(message: string, data: Record<string, unknown>) {
    super(message);
    this.name = "ToolError";
    this.data = data;
  }
}

export interface ToolContext {
  workerAuth?: boolean;
  env?: { NLB_API_KEY?: string; NLB_API_URL?: string };
  oauth?: { subject: string; scopes: string[] };
  fetch?: typeof fetch;
}
