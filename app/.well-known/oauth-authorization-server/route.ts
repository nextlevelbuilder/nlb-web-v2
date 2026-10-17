import { getOAuthAuth } from "@/lib/auth";
import { isMcpOAuthEnabled } from "@/lib/mcp-oauth-config";

export const dynamic = "force-dynamic";

// Older clients probe the root before trying the issuer-inserted RFC 8414 URL.
export async function GET(request: Request) {
  if (!isMcpOAuthEnabled()) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  url.pathname = "/.well-known/oauth-authorization-server/api/auth";
  return getOAuthAuth().handler(new Request(url, request));
}
