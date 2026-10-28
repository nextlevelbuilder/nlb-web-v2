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
 * MCP tools the NLB toolkits MCP server (`@nextlevelbuilder/mcp`) exposes for the Builder League.
 * They call the `/api/v1/builder-*` routes as the connected member.
 */
export const BUILDER_LEAGUE_MCP_TOOLS = [
  "get_builder_profile",
  "submit_builder_evidence",
  "list_builder_evidence",
  "get_builder_evidence",
  "list_builder_projects",
  "create_builder_project",
  "get_builder_rankings",
  "get_builder_journey",
  "list_builder_badges",
  "list_builder_missions",
  "list_builder_rewards",
  "get_builder_year_review",
] as const;

export const BUILDER_LEAGUE_AVAILABILITY =
  `Pilot only: while ${BUILDER_LEAGUE_FLAG} is off, every ${BUILDER_LEAGUE_ROUTE_PREFIX}* route answers 404 except for admins and pilot members, and the MCP tools report that Builder League is not enabled on this environment.`;

export const BUILDER_LEAGUE_AGENT_POLICY = {
  may: [
    "Read the connected member's own Builder League profile, journey, evidence, projects, missions, badges, rewards and Year in Review.",
    "Submit the member's own evidence (always stored as self_reported and submitted for human review) and create the member's projects.",
    "Read Builder League rankings.",
  ],
  mayNot: [
    "Approve, verify, reject or moderate evidence.",
    "Award or claim RP, badges or rewards, or confirm peer help.",
    "Read another member's private history or change privacy settings.",
    "Call /api/v1/builder-admin/* routes, which need a signed-in admin session (MCP delegation is refused).",
  ],
} as const;

export const BUILDER_LEAGUE_AUTH = {
  member: "Browser session, an API key (Authorization: Bearer nlb_live_… or x-api-key) or MCP delegation: mcp:read for reads, mcp:write for writes.",
  admin: "/api/v1/builder-admin/* needs a signed-in admin session; API keys and agents are refused.",
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
