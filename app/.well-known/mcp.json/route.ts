import { discoveryHeaders, mcpServerCard } from "@/lib/discovery/agent-discovery-documents";

/** MCP Server Card for the NLB directory MCP server (see lib/discovery/agent-discovery-documents.ts). */
export function GET() {
  return new Response(JSON.stringify(mcpServerCard(), null, 2), { headers: discoveryHeaders("application/json; charset=utf-8") });
}
