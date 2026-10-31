/**
 * Machine-readable discovery documents for AI agents and API clients:
 *
 * - `/.well-known/mcp.json`: an MCP Server Card (SEP-2127 schema) for the NLB MCP server, which this
 *   worker serves at `<site>/mcp` (packages/mcp, routed in worker.ts).
 * - `/.well-known/ai-catalog.json`: the domain AI Catalog listing that card plus the REST API.
 * - `/.well-known/api-catalog`: an RFC 9727 linkset pointing at the OpenAPI document and its docs.
 *
 * Builder League (pilot-only behind `BUILDER_LEAGUE_ENABLED`) is described in all three from
 * ./builder-league-discovery.ts; its MCP tool names appear only on the server card. The NLB Live operator
 * tools (./live-operator-discovery.ts) are on the server card only, as their routes are not in OpenAPI.
 *
 * The MCP facts mirror packages/mcp (server name, version, protocol versions served by MCP SDK v2)
 * and the `<site>/.well-known/oauth-protected-resource/mcp` document.
 */
import { siteUrl } from "@/lib/seo";
import { DISCOVERY_PATHS } from "./discovery-link-header";
import { BUILDER_LEAGUE_AVAILABILITY, BUILDER_LEAGUE_MCP_TOOLS, BUILDER_LEAGUE_ROUTE_PREFIX, builderLeagueDiscovery } from "./builder-league-discovery";
import { liveOperatorDiscovery } from "./live-operator-discovery";

export { DISCOVERY_PATHS };

export const MCP_ENDPOINT = "https://nextlevelbuilder.io/mcp";
export const MCP_SERVER_VERSION = "0.2.1";
/** 2026-07-28 is the stateless revision; the older ones are served through the SDK's legacy path. */
export const MCP_PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const MCP_SCOPES = ["mcp:read", "mcp:write", "mcp:keys", "mcp:operator", "offline_access"] as const;
const TOOLKITS_REPOSITORY = "https://github.com/nextlevelbuilder/nlb-web-v2";

/** The MCP endpoint this site serves. */
export function mcpEndpoint(site = siteUrl()): string {
  return new URL("/mcp", site).href;
}
const SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";


/** Headers shared by every discovery document: public, CORS-open, cached for an hour. */
export function discoveryHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    "X-Content-Type-Options": "nosniff",
  };
}

export function mcpServerCard() {
  const site = siteUrl();
  const endpoint = mcpEndpoint(site);
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: "io.nextlevelbuilder/directory",
    version: MCP_SERVER_VERSION,
    title: "Next Level Builders Directory",
    description: "Use Next Level Builders from any MCP client: search, read and submit directory products, check rankings and traffic, manage API keys, blog posts, Builder League progress and membership onboarding; platform operators also run NLB Live.",
    websiteUrl: `${site}/build-with-us#guide`,
    repository: { url: TOOLKITS_REPOSITORY, source: "github", subfolder: "packages/mcp" },
    icons: [
      { src: `${site}/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
      { src: `${site}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    ],
    remotes: [{ type: "streamable-http", url: endpoint, supportedProtocolVersions: [...MCP_PROTOCOL_VERSIONS] }],
    packages: [{ registryType: "npm", identifier: "@nextlevelbuilder/mcp", version: MCP_SERVER_VERSION, transport: { type: "stdio" } }],
    _meta: {
      "io.nextlevelbuilder/discovery": {
        serverName: "nlb-directory-mcp",
        authorization: {
          protectedResourceMetadata: new URL("/.well-known/oauth-protected-resource/mcp", endpoint).href,
          authorizationServer: `${site}/api/auth`,
          scopesSupported: [...MCP_SCOPES],
          apiKeyHeader: "Authorization: Bearer nlb_live_…",
        },
        openapi: `${site}${DISCOVERY_PATHS.openApi}`,
        apiDocs: `${site}${DISCOVERY_PATHS.apiDocs}`,
        llms: `${site}${DISCOVERY_PATHS.llms}`,
        llmsFull: `${site}${DISCOVERY_PATHS.llmsFull}`,
        builderLeague: { ...builderLeagueDiscovery(`${site}${DISCOVERY_PATHS.openApi}`), tools: [...BUILDER_LEAGUE_MCP_TOOLS] },
        liveOperator: liveOperatorDiscovery(),
      },
    },
  };
}

export function aiCatalog() {
  const site = siteUrl();
  const host = new URL(site).hostname;
  return {
    name: "Next Level Builders",
    description: "AI-facing interfaces of nextlevelbuilder.io: the directory MCP server and the REST API.",
    url: site,
    entries: [
      { identifier: `urn:air:${host}:mcp:directory`, type: "application/mcp-server-card+json", url: `${site}${DISCOVERY_PATHS.serverCard}`, data: mcpServerCard() },
      { identifier: `urn:air:${host}:openapi:v1`, type: "application/vnd.oai.openapi+json", url: `${site}${DISCOVERY_PATHS.openApi}` },
      {
        identifier: `urn:air:${host}:openapi:v1:builder-league`,
        type: "application/vnd.oai.openapi+json",
        url: `${site}${DISCOVERY_PATHS.openApi}`,
        data: builderLeagueDiscovery(`${site}${DISCOVERY_PATHS.openApi}`),
      },
      { identifier: `urn:air:${host}:llms:index`, type: "text/plain", url: `${site}${DISCOVERY_PATHS.llms}` },
      { identifier: `urn:air:${host}:llms:full`, type: "text/plain", url: `${site}${DISCOVERY_PATHS.llmsFull}` },
    ],
  };
}

/** RFC 9727 API catalog as an RFC 9264 linkset. */
export function apiCatalogLinkset() {
  const site = siteUrl();
  return {
    linkset: [
      {
        anchor: `${site}/api/v1`,
        "service-desc": [{ href: `${site}${DISCOVERY_PATHS.openApi}`, type: "application/vnd.oai.openapi+json" }],
        "service-doc": [{ href: `${site}${DISCOVERY_PATHS.apiDocs}`, type: "text/html" }],
        "service-meta": [{ href: `${site}${DISCOVERY_PATHS.serverCard}`, type: "application/json" }],
      },
      {
        // Builder League has no single base path, so its entry point (the member's own profile) anchors it.
        anchor: `${site}${BUILDER_LEAGUE_ROUTE_PREFIX}me`,
        "service-desc": [{ href: `${site}${DISCOVERY_PATHS.openApi}`, type: "application/vnd.oai.openapi+json", title: `NLB Builder League: ${BUILDER_LEAGUE_ROUTE_PREFIX}* routes in the OpenAPI document` }],
        "service-doc": [{ href: `${site}${DISCOVERY_PATHS.apiDocs}`, type: "text/html", title: "NLB Builder League API reference" }],
        "service-meta": [{ href: `${site}${DISCOVERY_PATHS.serverCard}`, type: "application/json", title: `Auth scopes, agent limits and MCP tools. ${BUILDER_LEAGUE_AVAILABILITY}` }],
      },
    ],
  };
}
