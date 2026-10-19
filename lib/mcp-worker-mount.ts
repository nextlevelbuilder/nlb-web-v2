/**
 * Mounts the NLB MCP server (packages/mcp) inside this worker. The canonical endpoint is
 * `MCP_OAUTH_RESOURCE` (for example https://nextlevelbuilder.io/mcp). A request on the host of a
 * `MCP_OAUTH_LEGACY_RESOURCES` entry (https://mcp.nextlevelbuilder.io/mcp) is served as that resource,
 * so clients that discovered the old host keep a consistent protected-resource document and audience.
 *
 * A worker cannot reliably fetch its own hostname, so the MCP server's calls to this site (JWKS and
 * the delegated /api/v1 requests) are handed to the Next.js handler in-process.
 */
import { createNlbMcpHttpHandler, type NlbMcpHttpHandler } from "@nextlevelbuilder/mcp/http";

export interface McpWorkerEnv {
  MCP_OAUTH_ENABLED?: string;
  MCP_OAUTH_RESOURCE?: string;
  MCP_OAUTH_LEGACY_RESOURCES?: string;
  MCP_DELEGATION_SECRET?: string;
  BETTER_AUTH_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

const MCP_PATHS = new Set(["/mcp", "/sse", "/message", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]);

export function isMcpPath(pathname: string): boolean {
  return MCP_PATHS.has(pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname);
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export interface McpMountConfig {
  apiBaseUrl: string;
  resource: string;
  acceptedAudiences: string[];
  delegationIssuer: string;
}

/** Resolves which resource a request is served as. Null when the site origin is not configured. */
export function resolveMcpMount(env: McpWorkerEnv, host: string): McpMountConfig | null {
  const site = env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL;
  if (!site || !URL.canParse(site)) return null;
  const apiBaseUrl = new URL(site).origin;
  const canonical = trimSlash(env.MCP_OAUTH_RESOURCE || `${apiBaseUrl}/mcp`);
  const legacy = (env.MCP_OAUTH_LEGACY_RESOURCES ?? "").split(",").map(value => trimSlash(value.trim()))
    .filter(value => value && URL.canParse(value) && value !== canonical);
  const legacyMatch = legacy.find(value => new URL(value).host === host);
  const resource = legacyMatch ?? canonical;
  return {
    apiBaseUrl,
    resource,
    acceptedAudiences: [canonical, ...legacy].filter(value => value !== resource),
    // The web verifies delegation assertions against the canonical resource, whatever host served them.
    delegationIssuer: canonical,
  };
}

const handlers = new Map<string, NlbMcpHttpHandler>();

/** Serves an MCP route, or resolves to null so the request falls through to Next.js. */
export async function serveMcp(
  request: Request,
  env: McpWorkerEnv,
  site: (request: Request) => Promise<Response>,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isMcpPath(url.pathname)) return null;
  const mount = resolveMcpMount(env, url.host);
  if (!mount) return Response.json({ error: "MCP is not configured" }, { status: 503 });
  // Bindings are fixed for the isolate, so one handler per served resource is reused across requests.
  const key = `${mount.resource}|${mount.apiBaseUrl}`;
  let handler = handlers.get(key);
  if (!handler) {
    const apiOrigin = mount.apiBaseUrl;
    handler = createNlbMcpHttpHandler({
      ...mount,
      oauthEnabled: env.MCP_OAUTH_ENABLED === "true",
      oauthIssuer: `${apiOrigin}/api/auth`,
      delegationSecret: env.MCP_DELEGATION_SECRET,
      fetch: (input, init) => {
        const inner = new Request(input, init);
        return new URL(inner.url).origin === apiOrigin ? site(inner) : fetch(inner);
      },
    });
    handlers.set(key, handler);
  }
  return handler(request);
}
