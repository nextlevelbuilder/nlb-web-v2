/**
 * Site-relative discovery paths and the page `Link` header. Dependency-free so the edge middleware stays small.
 */
export const DISCOVERY_PATHS = {
  serverCard: "/.well-known/mcp.json",
  aiCatalog: "/.well-known/ai-catalog.json",
  apiCatalog: "/.well-known/api-catalog",
  openApi: "/api/openapi.json",
  apiDocs: "/api-docs",
  llms: "/llms.txt",
  llmsFull: "/llms-full.txt",
} as const;

/**
 * `Link` header advertised on every page response (appended by middleware.ts), so agents that only read
 * headers still find the OpenAPI document, the llms indexes and the MCP card.
 */
export function discoveryLinkHeader(): string {
  return [
    `<${DISCOVERY_PATHS.llms}>; rel="alternate"; type="text/plain"; title="llms.txt"`,
    `<${DISCOVERY_PATHS.llmsFull}>; rel="alternate"; type="text/plain"; title="llms-full.txt"`,
    `<${DISCOVERY_PATHS.openApi}>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
    `<${DISCOVERY_PATHS.apiDocs}>; rel="service-doc"; type="text/html"`,
    `<${DISCOVERY_PATHS.apiCatalog}>; rel="api-catalog"; type="application/linkset+json"`,
    `<${DISCOVERY_PATHS.serverCard}>; rel="describedby"; type="application/json"; title="MCP server card"`,
  ].join(", ");
}
