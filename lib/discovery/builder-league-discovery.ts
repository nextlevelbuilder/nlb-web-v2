/**
 * Builder League facts for the agent discovery documents (`/.well-known/mcp.json`,
 * `/.well-known/ai-catalog.json`, `/.well-known/api-catalog`) and the API reference intro.
 *
 * The REST contract lives in the OpenAPI document (lib/builder-league/openapi/*); this module only
 * summarises it for agents: where the routes are, how they authenticate, what an agent may and may
 * not do, and that the whole surface is pilot-only until `BUILDER_LEAGUE_ENABLED` is on.
 * Access rules are owned by lib/builder-league/access.ts and lib/builder-league/admin-key-auth.ts.
 */

/** The flag that gates every Builder League route. Off in production until launch. */
export const BUILDER_LEAGUE_FLAG = "BUILDER_LEAGUE_ENABLED";

/** Route prefix shared by every Builder League REST endpoint (`/api/v1/builder-me`, `/api/v1/builder-evidence`, …). */
export const BUILDER_LEAGUE_ROUTE_PREFIX = "/api/v1/builder-";

/**
 * Builder League tools the NLB MCP server (`packages/mcp/src/tools/builder-league.ts`, served by this
 * Worker at `/mcp`) exposes. They call the `/api/v1/builder-*` routes as the connected member; the two
 * `builder_admin_*` tools are read-only or dry-run and need a signed-in admin session.
 * tests/discovery-surfaces.test.ts keeps this list equal to the tools the package defines.
 */
export const BUILDER_LEAGUE_MCP_TOOLS = [
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
  "builder_create_project",
  "builder_submit_evidence",
  "builder_update_evidence",
  "builder_withdraw_evidence",
  "builder_appeal_evidence",
  "builder_join_season",
  "builder_save_time_capsule",
  "builder_request_year_video",
  "builder_revoke_share_link",
  "builder_admin_list_queue",
  "builder_admin_backfill_preview",
] as const;

export const BUILDER_LEAGUE_AVAILABILITY =
  `Pilot only: while ${BUILDER_LEAGUE_FLAG} is off, every ${BUILDER_LEAGUE_ROUTE_PREFIX}* route answers 404 except for admins and pilot members, and the MCP tools report that Builder League is not enabled on this environment.`;

export const BUILDER_LEAGUE_AGENT_POLICY = {
  may: [
    "Read the connected member's own Builder League profile, journey, evidence, projects, missions, badges, rewards and Year in Review.",
    "Submit, edit, withdraw or appeal the member's own evidence (always stored as self_reported and submitted for human review) and create the member's projects.",
    "Join a season, save the member's Time Capsule, request a Year in Review video and revoke the member's own share links.",
    "Read Builder League rankings.",
    "Export the connected member's own league data (GET /api/v1/builder-me/export), which includes their private evidence and notes.",
  ],
  mayNot: [
    "Approve, verify, reject or moderate evidence.",
    "Award or claim RP, badges or rewards, or confirm peer help.",
    "Read another member's private history or change privacy settings.",
    "Call /api/v1/builder-admin/* routes, which need a signed-in admin session (MCP delegation is refused); the only exceptions are the render and ingest routes for admin-minted automation keys listed under automationScopes.",
    "Delete the member's league data: POST /api/v1/builder-me/delete needs a signed-in browser session.",
  ],
} as const;

export const BUILDER_LEAGUE_AUTH = {
  member: "Browser session, an API key (Authorization: Bearer nlb_live_… or x-api-key) or MCP delegation: mcp:read for reads, mcp:write for writes.",
  admin: "/api/v1/builder-admin/* needs a signed-in admin session; agents are refused, and API keys are refused except the scoped automation keys below on their own routes.",
  automationScopes: {
    "builder:render": "Admin-minted API key for the Year in Review render worker; accepted only on /api/v1/builder-admin/render-jobs/**.",
    "builder:ingest": "Admin-minted API key for the Discord bot; accepted only on /api/v1/builder-admin/ingest/discord.",
  },
} as const;

/** One summary object, shared by the server card `_meta` and the AI catalog entry. */
export function builderLeagueDiscovery(openApiUrl: string) {
  return {
    name: "NLB Builder League",
    description: "Builder progress for NLB members: evidence of shipping and contributing, RP, ranks, missions, badges, rewards, rankings and the Year in Review.",
    status: "pilot",
    flag: BUILDER_LEAGUE_FLAG,
    availability: BUILDER_LEAGUE_AVAILABILITY,
    routes: `${BUILDER_LEAGUE_ROUTE_PREFIX}*`,
    openapi: openApiUrl,
    auth: BUILDER_LEAGUE_AUTH,
    agentPolicy: BUILDER_LEAGUE_AGENT_POLICY,
  };
}
