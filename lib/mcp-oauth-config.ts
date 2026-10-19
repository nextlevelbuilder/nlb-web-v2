import { getCloudflareContext } from "@opennextjs/cloudflare";
import { mcp } from "@better-auth/mcp";
import { jwt } from "better-auth/plugins";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { getCurrentAdapter, type BetterAuthPlugin, type HookEndpointContext, type Verification } from "better-auth";
import { getCurrentAuthEndpointContext } from "@better-auth/core/context";
import { z } from "zod";
import { mcpClientIdMetadataDiscovery } from "@/lib/mcp-oauth-cimd";

export const MCP_OAUTH_SCOPES = ["mcp:read", "mcp:write", "mcp:keys", "offline_access"];
export const MCP_OAUTH_DEFAULT_RESOURCE = "https://mcp.nextlevelbuilder.io/mcp";

const authorizationCodeGrantSchema = z.object({
  type: z.literal("authorization_code"),
  userId: z.string(),
  referenceId: z.string().optional(),
  query: z.object({
    client_id: z.string(),
    scope: z.string(),
    resource: z.union([z.string(), z.array(z.string())]).optional(),
  }).passthrough(),
  resource: z.array(z.string()).optional(),
  mcpConsentId: z.string().optional(),
}).passthrough();

type AuthorizationCodeGrant = z.infer<typeof authorizationCodeGrantSchema>;
interface OAuthConsent {
  id: string;
  userId?: string | null;
  clientId: string;
  referenceId?: string | null;
  scopes: string[];
  resources?: string[] | null;
}

function rejectDisconnectedGrant(): never {
  throw new APIError("BAD_REQUEST", { error: "invalid_grant", error_description: "Authorization was disconnected. Start authorization again." });
}

function consentCoversGrant(consent: OAuthConsent, grant: AuthorizationCodeGrant): boolean {
  const resource = grant.resource ?? grant.query.resource;
  const resources = resource === undefined ? [] : Array.isArray(resource) ? resource : [resource];
  return consent.userId === grant.userId && consent.clientId === grant.query.client_id &&
    (consent.referenceId ?? undefined) === grant.referenceId &&
    grant.query.scope.split(/\s+/).filter(Boolean).every(scope => consent.scopes.includes(scope)) &&
    resources.every(value => consent.resources?.includes(value));
}

async function bindAuthorizationCodeToConsent(verification: Verification) {
  let raw: unknown;
  try { raw = JSON.parse(verification.value); } catch { return; }
  // Verification also stores OTPs and social-provider state; leave those records alone.
  if (!raw || typeof raw !== "object" || !("type" in raw) || raw.type !== "authorization_code") return;
  const parsed = authorizationCodeGrantSchema.safeParse(raw);
  if (!parsed.success) rejectDisconnectedGrant();
  const grant = parsed.data;
  const adapter = await getCurrentAdapter(getCurrentAuthEndpointContext().context.adapter);
  const consents = await adapter.findMany<OAuthConsent>({
    model: "oauthConsent", where: [{ field: "userId", value: grant.userId }, { field: "clientId", value: grant.query.client_id }],
  });
  const consent = consents.find(value => consentCoversGrant(value, grant));
  if (!consent) rejectDisconnectedGrant();
  // The database hook owns this binding; authorization request parameters cannot set it.
  return { data: { ...verification, value: JSON.stringify({ ...grant, mcpConsentId: consent.id }) } };
}

function getBinding(name: string): string | undefined {
  try {
    return (getCloudflareContext().env as unknown as Record<string, string>)[name];
  } catch {
    return process.env[name];
  }
}

export function isMcpOAuthEnabled(): boolean {
  return getBinding("MCP_OAUTH_ENABLED") === "true";
}

export function getMcpOAuthResource(): string {
  const configured = getBinding("MCP_OAUTH_RESOURCE");
  const resource = configured || MCP_OAUTH_DEFAULT_RESOURCE;
  const url = new URL(resource);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || resource.includes("?") || resource.includes("#")) {
    throw new Error("MCP_OAUTH_RESOURCE must be HTTPS (or an explicit local loopback HTTP URL), without credentials, query, or fragment.");
  }
  return url.href.replace(/\/$/, "");
}

export function getMcpOAuthPlugins() {
  const resource = getMcpOAuthResource();
  const provider = mcp({
    loginPage: "/sign-in",
    consentPage: "/oauth/consent",
    resource,
    scopes: MCP_OAUTH_SCOPES,
    grantTypes: ["authorization_code", "refresh_token"],
    // Client ID Metadata Documents are the MCP 2026-07-28 default; Dynamic Client Registration stays for older clients.
    extensions: [{ clientDiscovery: mcpClientIdMetadataDiscovery }],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    allowPublicClientPrelogin: true,
    clientRegistrationRequirePKCE: true,
    clientRegistrationDefaultScopes: MCP_OAUTH_SCOPES,
    accessTokenExpiresIn: 300,
    refreshTokenExpiresIn: 60 * 60 * 24 * 30,
    refreshTokenReuseInterval: 0,
    enforcePerClientResources: true,
    identifierValidator: (identifier) => identifier === resource,
    resourcePrivileges: () => false,
    clientPrivileges: () => false,
    async customTokenResponseFields({ grantType, verificationValue }) {
      if (grantType !== "authorization_code") return {};
      // Runs after the provider consumes the code and validates client, redirect, PKCE and session,
      // but before it creates access or refresh tokens. Keep those validations provider-owned.
      const parsed = authorizationCodeGrantSchema.safeParse(verificationValue);
      if (!parsed.success || !parsed.data.mcpConsentId) rejectDisconnectedGrant();
      const grant = parsed.data;
      const adapter = await getCurrentAdapter(getCurrentAuthEndpointContext().context.adapter);
      const consent = await adapter.findOne<OAuthConsent>({
        model: "oauthConsent", where: [{ field: "id", value: grant.mcpConsentId! }],
      });
      if (!consent || !consentCoversGrant(consent, grant)) rejectDisconnectedGrant();
      return {};
    },
  });
  // Better Auth deletes consent without revoking tokens. Disconnect must do both.
  provider.hooks.before.push({
    matcher: (ctx) => ctx.path === "/oauth2/delete-consent",
    handler: createAuthMiddleware(async (ctx) => {
      const session = await getSessionFromCtx(ctx);
      if (!session) throw new APIError("UNAUTHORIZED");
      const consent = await ctx.context.adapter.findOne<{ userId: string; clientId: string }>({
        model: "oauthConsent", where: [{ field: "id", value: ctx.body?.id }],
      });
      if (!consent || consent.userId !== session.user.id) throw new APIError("UNAUTHORIZED");
      const where = [{ field: "clientId", value: consent.clientId }, { field: "userId", value: session.user.id }];
      // Revoke all grants to this client, including refresh families from other sessions.
      await ctx.context.adapter.updateMany({ model: "oauthRefreshToken", where, update: { revoked: new Date() } });
      await ctx.context.adapter.updateMany({ model: "oauthAccessToken", where, update: { revoked: new Date() } });
    }),
  });
  const consentBinding = {
    id: "mcp-consent-binding",
    schema: {},
    // Better Auth composes plugin database hooks with its other plugins and application hooks.
    init: () => ({ options: { databaseHooks: { verification: { create: { before: bindAuthorizationCodeToConsent } } } } }),
  };
  // RFC 8707: without a resource the provider issues an audience-less opaque token. This server protects a
  // single MCP resource, so an authorization request that omits it is bound to that resource; any other
  // value is still validated (and rejected) by the provider.
  const defaultResource = {
    id: "mcp-default-resource",
    schema: {},
    hooks: {
      before: [{
        matcher: (ctx: HookEndpointContext) => ctx.path === "/oauth2/authorize",
        handler: createAuthMiddleware(async (ctx) => {
          const source = ctx.method === "POST" ? "body" : "query";
          const params: unknown = ctx[source];
          const values = params && typeof params === "object" ? params as Record<string, unknown> : {};
          if (values.resource !== undefined) return;
          return { context: { [source]: { ...values, resource } } };
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
  return [jwt({ jwks: { keyPairConfig: { alg: "RS256" } } }), provider, consentBinding, defaultResource];
}
