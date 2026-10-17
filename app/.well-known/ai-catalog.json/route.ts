import { aiCatalog, discoveryHeaders } from "@/lib/discovery/agent-discovery-documents";

/** Domain AI Catalog: the MCP server card, OpenAPI and llms indexes. */
export function GET() {
  return new Response(JSON.stringify(aiCatalog(), null, 2), { headers: discoveryHeaders("application/ai-catalog+json; charset=utf-8") });
}
