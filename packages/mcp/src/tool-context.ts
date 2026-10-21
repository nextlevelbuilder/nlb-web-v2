export const MCP_SCOPES = ["mcp:read", "mcp:write", "mcp:keys"] as const;
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

/** Reads that always need an identity (no anonymous fallback). */
export const PRIVATE_READ_TOOLS = [
  "get_product_traffic",
  "blog_list_revisions",
  "blog_get_revision",
  "onboarding_get_status",
  ...BUILDER_READ_TOOLS
] as const;

/** Reads that are public anonymously but forward the caller's identity when present (e.g. admin draft access). */
export const IDENTITY_AWARE_READ_TOOLS = ["blog_list_posts", "blog_get_post"] as const;

export function requiredToolScope(name: string): McpScope {
  if (["list_api_keys", "create_api_key", "revoke_api_key"].includes(name)) return "mcp:keys";
  if (["submit_product", "cast_vote", "upload_media", "create_checkout", ...BLOG_WRITE_TOOLS, ...BUILDER_WRITE_TOOLS].includes(name)) return "mcp:write";
  return "mcp:read";
}

/**
 * Tools that mutate remote state: anonymous HTTP callers are refused before they run
 * (server.ts MUTATING_TOOLS). Builder League tools also refuse anonymous callers in their handlers.
 */
export function isMutatingTool(name: string): boolean {
  return ["submit_product", "cast_vote", "upload_media", "create_checkout", "create_api_key", "revoke_api_key"].includes(name) ||
    (BLOG_WRITE_TOOLS as readonly string[]).includes(name) ||
    (BUILDER_WRITE_TOOLS as readonly string[]).includes(name);
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
