import { getOAuthAuth } from "@/lib/auth";
import { isMcpOAuthEnabled } from "@/lib/mcp-oauth-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isMcpOAuthEnabled()) return new Response(null, { status: 404 });
  return getOAuthAuth().handler(request);
}
