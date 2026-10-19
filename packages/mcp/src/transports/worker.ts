import { SERVER_NAME, SERVER_VERSION } from "../server.js";
import { TOOLS } from "../tools/index.js";
import { createNlbMcpHttpHandler, type NlbMcpHttpHandler } from "../http.js";

/**
 * Self-hosting entry: a standalone Cloudflare Worker over the same handler the nlb-web worker
 * mounts in-process. Production serves MCP from https://nextlevelbuilder.io/mcp; nothing in CI
 * deploys this entry.
 */
export interface WorkerEnv {
  NLB_API_KEY?: string;
  NLB_API_URL?: string;
  WORKER_AUTH_TOKEN?: string;
  NLB_ALLOWED_ORIGINS?: string;
  NLB_OAUTH_ENABLED?: string;
  NLB_OAUTH_ISSUER?: string;
  NLB_OAUTH_RESOURCE?: string;
  MCP_DELEGATION_SECRET?: string;
}

const DEFAULT_API_URL = "https://nextlevelbuilder.io";
const DEFAULT_RESOURCE = "https://mcp.nextlevelbuilder.io/mcp";

// One handler per bindings object keeps the JWKS cache warm across requests in an isolate.
const handlers = new WeakMap<WorkerEnv, NlbMcpHttpHandler>();

function handlerFor(env: WorkerEnv): NlbMcpHttpHandler {
  let handler = handlers.get(env);
  if (!handler) {
    const apiBaseUrl = env.NLB_API_URL || DEFAULT_API_URL;
    handler = createNlbMcpHttpHandler({
      apiBaseUrl,
      resource: env.NLB_OAUTH_RESOURCE || DEFAULT_RESOURCE,
      oauthEnabled: env.NLB_OAUTH_ENABLED === "true",
      oauthIssuer: env.NLB_OAUTH_ISSUER || `${apiBaseUrl}/api/auth`,
      delegationSecret: env.MCP_DELEGATION_SECRET,
      workerAuthToken: env.WORKER_AUTH_TOKEN,
      apiKey: env.NLB_API_KEY,
      allowedOrigins: env.NLB_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean)
    });
    handlers.set(env, handler);
  }
  return handler;
}

/**
 * Cloudflare Workers fetch handler: the MCP routes of createNlbMcpHttpHandler, plus
 * POST / as an alias of POST /mcp and GET / or /health as a health check.
 */
export async function handleWorkerFetch(request: Request, env: WorkerEnv = {}): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" || (url.pathname === "/" && request.method === "GET")) {
    return Response.json(
      { status: "ok", service: SERVER_NAME, version: SERVER_VERSION, toolsCount: TOOLS.length },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
  const mcpRequest = url.pathname === "/" ? new Request(new URL("/mcp", url), request) : request;
  return (await handlerFor(env)(mcpRequest)) ?? new Response("Not Found", { status: 404 });
}

export default {
  fetch: (request: Request, env: WorkerEnv) => handleWorkerFetch(request, env)
};
