import { createRemoteJWKSet, customFetch, jwtVerify, SignJWT, type JWTPayload } from "jose";
import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  verifyBearerToken,
  type AuthInfo,
  type OAuthTokenVerifier
} from "@modelcontextprotocol/server";
import {
  MCP_SCOPES,
  isIdentityAwareReadTool,
  isPrivateReadTool,
  requiredToolScope,
  type McpScope,
  type ToolContext
} from "./tool-context.js";
import type { McpCaller } from "./server.js";

/** Raw OAuth resource-server settings, validated by resolveOAuthConfig. */
export interface OAuthSettings {
  /** Authorization server issuer; its JWKS is read from `${issuer}/jwks`. */
  issuer?: string;
  /** Canonical RFC 8707 resource identifier for this endpoint (PRM `resource`). */
  resource: string;
  /** Additional token audiences accepted besides `resource` (e.g. a previous endpoint URL). */
  acceptedAudiences?: readonly string[];
  /** Origin of the NLB API; delegation assertions are only sent there. */
  apiUrl: string;
  /** HS256 secret (≥ 32 bytes) shared with the web's delegation verifier. */
  delegationSecret?: string;
  /** `iss` of delegation assertions; defaults to `resource`. */
  delegationIssuer?: string;
  /** Fetch used for JWKS and delegated API calls; defaults to the global fetch at call time. */
  fetch?: typeof fetch;
}

export interface OAuthConfig {
  issuer: string;
  resource: string;
  audiences: string[];
  /** RFC 9728 metadata URL advertised in every challenge. */
  resourceMetadataUrl: string;
  apiUrl: string;
  delegationIssuer: string;
  secret: Uint8Array;
  fetch?: typeof fetch;
  keySet: ReturnType<typeof createRemoteJWKSet>;
}

/** Access tokens are short-lived; longer lifetimes are refused even when correctly signed. */
const MAX_ACCESS_TOKEN_LIFETIME_SECONDS = 300;
/** Upper bound on a delegation assertion's lifetime (matches the web verifier). */
const MAX_DELEGATION_LIFETIME_SECONDS = 60;

function canonicalUrl(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new Error("OAuth configuration requires HTTPS URLs (HTTP loopback is allowed for development)");
  }
  return url.href.replace(/\/$/, "");
}

/** Validates the OAuth configuration; throws when incomplete so callers fail closed. */
export function resolveOAuthConfig(settings: OAuthSettings): OAuthConfig {
  if (!settings.issuer) throw new Error("OAuth requires an issuer");
  const issuer = canonicalUrl(settings.issuer);
  const resource = canonicalUrl(settings.resource);
  const apiUrl = canonicalUrl(settings.apiUrl);
  const audiences = [...new Set([resource, ...(settings.acceptedAudiences ?? []).map(canonicalUrl)])];
  const delegationIssuer = canonicalUrl(settings.delegationIssuer || resource);
  const secret = new TextEncoder().encode(settings.delegationSecret || "");
  if (secret.byteLength < 32 || apiUrl !== new URL(apiUrl).origin || new URL(issuer).origin !== apiUrl) {
    throw new Error("OAuth requires a delegation secret and matching issuer/API origins");
  }
  const outbound = settings.fetch;
  const keySet = createRemoteJWKSet(new URL(`${issuer}/jwks`), {
    timeoutDuration: 5000,
    // jose's fetch signature is a subset of fetch's; forward it unchanged.
    ...(outbound ? { [customFetch]: (url: string, init: RequestInit) => outbound(url, init) } : {})
  });
  return {
    issuer, resource, audiences, apiUrl, delegationIssuer, secret, fetch: outbound, keySet,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(resource))
  };
}

export function oauthNotConfiguredResponse(): Response {
  return Response.json({ error: "OAuth is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

/** RFC 9728 Protected Resource Metadata for this MCP endpoint. */
export function protectedResourceMetadataResponse(config: OAuthConfig, method: string): Response {
  const response = Response.json({
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Next Level Builders MCP"
  }, { headers: { "Cache-Control": "public, max-age=300" } });
  return method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
}

/** 401 invalid_token / 403 insufficient_scope with every scope the request needs in one challenge. */
export function oauthChallengeResponse(config: OAuthConfig, error: unknown, scopes: readonly string[]): Response {
  const response = bearerAuthChallengeResponse(error, { requiredScopes: [...scopes], resourceMetadataUrl: config.resourceMetadataUrl });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function invalidToken(message: string): OAuthError {
  return new OAuthError(OAuthErrorCode.InvalidToken, message);
}

/** Verifies issuer-signed JWT access tokens whose audience is one of the accepted resources. */
export function createAccessTokenVerifier(config: OAuthConfig): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, config.keySet, {
          issuer: config.issuer,
          audience: config.audiences,
          algorithms: ["RS256", "ES256", "EdDSA"],
          typ: "at+jwt",
          requiredClaims: ["sub", "exp", "iat", "scope"],
          maxTokenAge: MAX_ACCESS_TOKEN_LIFETIME_SECONDS
        }));
      } catch {
        throw invalidToken("The access token is invalid or expired");
      }
      if (!payload.sub || typeof payload.scope !== "string" || !payload.exp || !payload.iat ||
          payload.exp - payload.iat > MAX_ACCESS_TOKEN_LIFETIME_SECONDS) {
        throw invalidToken("The access token is missing required claims");
      }
      const clientId = typeof payload.client_id === "string" ? payload.client_id : typeof payload.azp === "string" ? payload.azp : "";
      return {
        token,
        clientId,
        scopes: payload.scope.split(/\s+/).filter(Boolean),
        expiresAt: payload.exp,
        // jwtVerify already required aud to name an accepted resource (RFC 8707 audience binding);
        // report the canonical resource so the SDK's expectedResource check holds for legacy audiences too.
        resource: new URL(config.resource),
        extra: { subject: payload.sub }
      };
    }
  };
}

/** Verifies a Bearer header; throws OAuthError (map it with oauthChallengeResponse). */
export async function verifyAccessToken(authorization: string, config: OAuthConfig): Promise<AuthInfo> {
  return verifyBearerToken(authorization, {
    verifier: createAccessTokenVerifier(config),
    expectedResource: new URL(config.resource),
    resourceMetadataUrl: config.resourceMetadataUrl
  });
}

/**
 * Fetch used by tools for an OAuth caller. The access token is never forwarded: each API call
 * carries a separate HS256 assertion bound to user, scope, method and path, valid ≤ 60 s.
 */
export function delegatedFetch(config: OAuthConfig, subject: string, expiresAt: number, scope: McpScope, forwardIdentity: boolean): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== config.apiUrl || !url.pathname.startsWith("/api/")) {
      throw new Error("OAuth calls must use the configured NLB API");
    }
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt <= now) throw new Error("OAuth access token expired");
    const headers = new Headers(request.headers);
    headers.delete("Authorization");
    headers.delete("Cookie");
    headers.delete("x-api-key");
    headers.delete("X-NLB-MCP-Assertion");
    if (scope !== "mcp:read" || forwardIdentity) {
      const assertion = await new SignJWT({ scope, method: request.method, path: url.pathname })
        .setProtectedHeader({ alg: "HS256", typ: "nlb-mcp-delegation+jwt" })
        .setIssuer(config.delegationIssuer).setAudience(`${config.apiUrl}/api`).setSubject(subject)
        .setJti(crypto.randomUUID()).setIssuedAt(now).setExpirationTime(Math.min(now + MAX_DELEGATION_LIFETIME_SECONDS, expiresAt))
        .sign(config.secret);
      headers.set("X-NLB-MCP-Assertion", assertion);
    }
    // Workers supports only follow/manual. Reject redirects before any second request.
    const response = await (config.fetch ?? fetch)(new Request(request, { headers, redirect: "manual" }));
    if (response.status >= 300 && response.status < 400) {
      throw new Error("OAuth API redirects are not allowed");
    }
    return response;
  };
}

/** Builds the per-tool ToolContext for a verified OAuth caller. */
export function oauthToolContext(config: OAuthConfig, subject: string, scopes: string[], expiresAt: number, toolName: string): ToolContext {
  // Identity-aware reads stay public anonymously but sign a delegation when the caller is authenticated.
  const forwardIdentity = isPrivateReadTool(toolName) || isIdentityAwareReadTool(toolName);
  return {
    env: { NLB_API_URL: config.apiUrl },
    oauth: { subject, scopes },
    fetch: delegatedFetch(config, subject, expiresAt, requiredToolScope(toolName), forwardIdentity)
  };
}

/** The MCP caller for auth info produced by verifyAccessToken. */
export function oauthCaller(config: OAuthConfig, authInfo: AuthInfo): McpCaller {
  const subject = authInfo.extra?.subject;
  if (typeof subject !== "string" || !subject || authInfo.expiresAt === undefined) {
    throw new Error("Verified OAuth auth info is missing its subject or expiry");
  }
  const expiresAt = authInfo.expiresAt;
  const scopes = [...authInfo.scopes];
  return {
    kind: "oauth",
    subject,
    scopes,
    contextFor: (toolName) => oauthToolContext(config, subject, scopes, expiresAt, toolName)
  };
}
