/**
 * Transport-agnostic MCP HTTP handler (web-standard Request/Response only, no Node imports).
 * Mounted in-process by the nlb-web worker at /mcp and by the standalone worker in
 * transports/worker.ts. Only plain types cross this module's public surface, so importers are
 * not exposed to the SDK's zod 4 types.
 */
import {
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  OAuthError,
  OAuthErrorCode,
  createMcpHandler,
  isJsonContentType,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  readRequestBody,
  validateHostHeader,
  validateOriginHeader,
  type AuthInfo
} from "@modelcontextprotocol/server";
import { SERVER_NAME, createNlbMcpServer, toolRequiresIdentity, type McpCaller } from "./server.js";
import { requiredToolScope } from "./tool-context.js";
import {
  oauthCaller,
  oauthChallengeResponse,
  oauthNotConfiguredResponse,
  protectedResourceMetadataResponse,
  resolveOAuthConfig,
  verifyAccessToken,
  type OAuthConfig
} from "./oauth.js";
import { handleLegacySseMessage, openLegacySseSession, readJsonRpcMessages } from "./transports/legacy-sse.js";

export interface NlbMcpHttpOptions {
  /** Origin of the NLB API used by tools (e.g. https://nextlevelbuilder.io). */
  apiBaseUrl: string;
  /** Canonical resource URL of this MCP endpoint for the serving host (e.g. https://nextlevelbuilder.io/mcp). */
  resource: string;
  /** OAuth authorization server issuer (e.g. https://nextlevelbuilder.io/api/auth). Required when OAuth is enabled. */
  oauthIssuer?: string;
  /** Extra token audiences accepted besides `resource` (e.g. https://mcp.nextlevelbuilder.io/mcp). */
  acceptedAudiences?: string[];
  /** HS256 secret (≥ 32 bytes) for x-nlb-mcp-assertion. Required when OAuth is enabled. */
  delegationSecret?: string;
  /** `iss` of x-nlb-mcp-assertion; defaults to `resource`. */
  delegationIssuer?: string;
  /** Fetch for ALL outbound calls (API, JWKS). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Act as an OAuth resource server (default true). When false, callers are anonymous or Worker-token callers. */
  oauthEnabled?: boolean;
  /** Static Bearer token granting full tool access (self-hosted deployments). */
  workerAuthToken?: string;
  /** Server API key used by Worker-token callers when no api_key argument is given. */
  apiKey?: string;
  /** Extra browser origins allowed by CORS (exact origins). */
  allowedOrigins?: string[];
  /** Extra Host names served besides the resource/audience hosts, *.workers.dev and loopback. */
  allowedHosts?: string[];
}

/** Serves a request, or resolves to null when the path is not an MCP route. */
export type NlbMcpHttpHandler = (request: Request) => Promise<Response | null>;

const MCP_PATH = "/mcp";
const PRM_ROOT_PATH = "/.well-known/oauth-protected-resource";

function hostnameOf(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

/** Tool names targeted by tools/call messages in a POST body (single or batch); [] when not parseable. */
async function calledToolNames(request: Request): Promise<string[]> {
  if (!isJsonContentType(request.headers.get("Content-Type"))) return [];
  try {
    const body = await readRequestBody(request.clone(), DEFAULT_MAX_REQUEST_BODY_SIZE);
    if (body.tooLarge) return [];
    const parsed: unknown = JSON.parse(body.text);
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    return messages.flatMap((message) => {
      const rpc = message as { method?: unknown; params?: { name?: unknown } } | null;
      return rpc?.method === "tools/call" && typeof rpc.params?.name === "string" ? [rpc.params.name] : [];
    });
  } catch {
    // Malformed bodies are answered by the MCP handler with the proper JSON-RPC error.
    return [];
  }
}

function acceptsEventStream(request: Request): boolean {
  return request.headers.get("Accept")?.toLowerCase().includes("text/event-stream") ?? false;
}

function isEventStream(response: Response): boolean {
  return response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() === "text/event-stream";
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
  return result;
}

interface RequestAuth {
  caller: McpCaller;
  authInfo?: AuthInfo;
}

/**
 * Creates the MCP HTTP handler. Routes (anything else resolves to null):
 * - POST /mcp: MCP Streamable HTTP for 2026-07-28 (stateless) and 2025-era clients
 * - GET, DELETE /mcp: 405 (stateless endpoint, no standalone stream or session)
 * - GET/HEAD /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/mcp: RFC 9728 metadata
 * - GET /sse + POST /message: deprecated HTTP+SSE transport bridged onto POST /mcp
 * - OPTIONS on any of the above: CORS preflight
 */
export function createNlbMcpHttpHandler(options: NlbMcpHttpOptions): NlbMcpHttpHandler {
  const oauthEnabled = options.oauthEnabled ?? true;
  let config: OAuthConfig | undefined;
  if (oauthEnabled) {
    try {
      config = resolveOAuthConfig({
        issuer: options.oauthIssuer,
        resource: options.resource,
        acceptedAudiences: options.acceptedAudiences,
        apiUrl: options.apiBaseUrl,
        delegationSecret: options.delegationSecret,
        delegationIssuer: options.delegationIssuer,
        fetch: options.fetch
      });
    } catch {
      // Fail closed per request (503) instead of throwing at mount time; config stays undefined.
    }
  }
  const prmPaths = new Set([PRM_ROOT_PATH]);
  const resourcePath = hostnameOf(options.resource) ? new URL(options.resource).pathname.replace(/\/$/, "") : "";
  if (resourcePath) prmPaths.add(`${PRM_ROOT_PATH}${resourcePath}`);
  prmPaths.add(`${PRM_ROOT_PATH}${MCP_PATH}`);

  const resourceHosts = [options.resource, ...(options.acceptedAudiences ?? [])]
    .map(hostnameOf).filter((host): host is string => Boolean(host));
  const allowedHosts = [...resourceHosts, ...(options.allowedHosts ?? []), ...localhostAllowedHostnames()];
  const allowedOriginHosts = [...resourceHosts, ...localhostAllowedOrigins()];
  const apiEnv = { NLB_API_URL: options.apiBaseUrl, NLB_API_KEY: options.apiKey };

  /** DNS-rebinding guard; runtimes that build a Request without Host fall back to the URL authority. */
  function hostRejection(request: Request): Response | undefined {
    const result = validateHostHeader(request.headers.get("Host") ?? new URL(request.url).host, allowedHosts);
    if (result.ok || result.hostname?.endsWith(".workers.dev")) return undefined;
    return Response.json({ error: "Forbidden host" }, { status: 403 });
  }

  function corsHeaders(request: Request, url: URL): Record<string, string> | Response {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID",
      "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version, Mcp-Session-Id"
    };
    const origin = request.headers.get("Origin");
    if (!origin) return headers;
    const allowed = origin === url.origin || (options.allowedOrigins ?? []).includes(origin) ||
      validateOriginHeader(origin, allowedOriginHosts).ok;
    if (!allowed) return new Response("Forbidden origin", { status: 403 });
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
    return headers;
  }

  /**
   * The Worker token keeps working; with OAuth a Bearer JWT is verified (issuer JWKS, accepted
   * audience). Anonymous callers may run public reads; otherwise they get a 401 challenge naming
   * every scope the request needs.
   */
  async function authenticate(request: Request): Promise<RequestAuth | Response> {
    const authorization = request.headers.get("Authorization");
    if (options.workerAuthToken && authorization === `Bearer ${options.workerAuthToken}`) {
      return { caller: { kind: "worker", env: apiEnv, fetch: options.fetch } };
    }
    const anonymous: RequestAuth = { caller: { kind: "anonymous", env: apiEnv, fetch: options.fetch } };
    if (!oauthEnabled) return anonymous;
    if (!config) return oauthNotConfiguredResponse();
    const tools = await calledToolNames(request);
    const scopesFor = (names: string[]) => [...new Set(names.map(requiredToolScope))];
    if (!authorization) {
      const required = scopesFor(tools.filter(toolRequiresIdentity));
      if (!required.length) return anonymous;
      return oauthChallengeResponse(config, new OAuthError(OAuthErrorCode.InvalidToken, "Authentication required"), required);
    }
    try {
      const authInfo = await verifyAccessToken(authorization, config);
      return { caller: oauthCaller(config, authInfo), authInfo };
    } catch (error) {
      const required = scopesFor(tools);
      return oauthChallengeResponse(config, error, required.length ? required : ["mcp:read"]);
    }
  }

  /**
   * One MCP POST through a per-request SDK handler. Clients that accept only JSON (the previous
   * behaviour of this endpoint) get an SSE answer collapsed back into a JSON body.
   */
  async function serveMcpPost(request: Request): Promise<Response> {
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    const { caller, authInfo } = auth;
    const handler = createMcpHandler(
      // The server is derived from the verified auth info the SDK hands back to the factory.
      (ctx) => createNlbMcpServer(ctx.authInfo && config ? oauthCaller(config, ctx.authInfo) : caller),
      { legacy: "stateless", onerror: (error) => console.warn(`[${SERVER_NAME}] ${error.message}`) }
    );
    const jsonOnly = !acceptsEventStream(request);
    let forwarded = request;
    if (jsonOnly) {
      const headers = new Headers(request.headers);
      headers.set("Accept", "application/json, text/event-stream");
      forwarded = new Request(request.url, { method: request.method, headers, body: await request.arrayBuffer() });
    }
    const response = await handler.fetch(forwarded, authInfo ? { authInfo } : undefined);
    if (!jsonOnly || !isEventStream(response)) return response;
    const messages = (await readJsonRpcMessages(response))
      .filter((message) => typeof message === "object" && message !== null && "id" in message);
    if (!messages.length) return new Response(null, { status: 202 });
    return Response.json(messages.length === 1 ? messages[0] : messages, { status: response.status });
  }

  async function route(request: Request, url: URL, cors: Record<string, string>): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (prmPaths.has(url.pathname)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
      }
      return config ? protectedResourceMetadataResponse(config, request.method) : oauthNotConfiguredResponse();
    }
    if (url.pathname === "/sse") {
      return request.method === "GET"
        ? openLegacySseSession(cors)
        : new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, OPTIONS" } });
    }
    if (url.pathname === "/message") {
      return request.method === "POST"
        ? handleLegacySseMessage(request, cors, serveMcpPost)
        : new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, OPTIONS" } });
    }
    if (request.method === "POST") return serveMcpPost(request);
    // Stateless endpoint: no standalone GET stream and no session to DELETE.
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, OPTIONS" } });
  }

  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
    const isPrm = prmPaths.has(path);
    if (path !== MCP_PATH && path !== "/sse" && path !== "/message" && !isPrm) return null;
    if (isPrm && !oauthEnabled) return null;
    const hostRejected = hostRejection(request);
    if (hostRejected) return hostRejected;
    const cors = corsHeaders(request, url);
    if (cors instanceof Response) return cors;
    url.pathname = path;
    return withHeaders(await route(request, url, cors), cors);
  };
}
