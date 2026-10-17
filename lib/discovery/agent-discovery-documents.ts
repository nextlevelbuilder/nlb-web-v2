/**
 * Machine-readable discovery documents for AI agents and API clients:
 *
 * - `/.well-known/mcp.json`: an MCP Server Card (SEP-2127 schema) for the NLB directory MCP server.
 *   SEP-2127 recommends `<mcp-url>/server-card` on the MCP host itself; that host is deployed from the
 *   nlb-directory-toolkits repo, so this site publishes the same card at the conventional domain path.
 * - `/.well-known/ai-catalog.json`: the domain AI Catalog listing that card plus the REST API.
 * - `/.well-known/api-catalog`: an RFC 9727 linkset pointing at the OpenAPI document and its docs.
 *
 * The MCP facts mirror nlb-directory-toolkits/packages/mcp (server name, version, protocol versions)
 * and the live https://mcp.nextlevelbuilder.io/.well-known/oauth-protected-resource document.
 */
import { siteUrl } from "@/lib/seo";
import { DISCOVERY_PATHS } from "./discovery-link-header";

export { DISCOVERY_PATHS };

export const MCP_ENDPOINT = "https://mcp.nextlevelbuilder.io/mcp";
export const MCP_SERVER_VERSION = "0.2.1";
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2024-11-05"] as const;
export const MCP_SCOPES = ["mcp:read", "mcp:write", "mcp:keys", "offline_access"] as const;
const TOOLKITS_REPOSITORY = "https://github.com/nextlevelbuilder/nlb-directory-toolkits";
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
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: "io.nextlevelbuilder/directory",
    version: MCP_SERVER_VERSION,
    title: "Next Level Builders Directory",
    description: "Search, read and submit products in the Next Level Builders directory, check rankings and traffic and manage API keys from any MCP client.",
    websiteUrl: `${site}/build-with-us/instructions`,
    repository: { url: TOOLKITS_REPOSITORY, source: "github", subfolder: "packages/mcp" },
    icons: [
      { src: `${site}/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
      { src: `${site}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    ],
    remotes: [{ type: "streamable-http", url: MCP_ENDPOINT, supportedProtocolVersions: [...MCP_PROTOCOL_VERSIONS] }],
    packages: [{ registryType: "npm", identifier: "@nextlevelbuilder/mcp", version: MCP_SERVER_VERSION, transport: { type: "stdio" } }],
    _meta: {
      "io.nextlevelbuilder/discovery": {
        serverName: "nlb-directory-mcp",
        authorization: {
          protectedResourceMetadata: "https://mcp.nextlevelbuilder.io/.well-known/oauth-protected-resource",
          authorizationServer: `${site}/api/auth`,
          scopesSupported: [...MCP_SCOPES],
          apiKeyHeader: "Authorization: Bearer nlb_live_…",
        },
        openapi: `${site}${DISCOVERY_PATHS.openApi}`,
        apiDocs: `${site}${DISCOVERY_PATHS.apiDocs}`,
        llms: `${site}${DISCOVERY_PATHS.llms}`,
        llmsFull: `${site}${DISCOVERY_PATHS.llmsFull}`,
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
    ],
  };
}
