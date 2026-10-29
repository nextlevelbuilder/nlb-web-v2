import { getCloudflareContext } from "@opennextjs/cloudflare";
import { mcp } from "@better-auth/mcp";
import { jwt } from "better-auth/plugins";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { getCurrentAdapter, type BetterAuthPlugin, type HookEndpointContext, type Verification } from "better-auth";
import { getCurrentAuthEndpointContext } from "@better-auth/core/context";
import { z } from "zod";
import { mcpClientIdMetadataDiscovery } from "@/lib/mcp-oauth-cimd";
import { getDb } from "@/lib/db";
import { getOperatorCapabilities } from "@/lib/operators/operator-grants";

/** Lets a token reach the operator APIs. Only users with an unrevoked platform operator grant may hold it. */
export const MCP_OPERATOR_SCOPE = "mcp:operator";
export const MCP_OAUTH_SCOPES = ["mcp:read", "mcp:write", "mcp:keys", MCP_OPERATOR_SCOPE, "offline_access"];
export const MCP_OAUTH_DEFAULT_RESOURCE = "https://nextlevelbuilder.io/mcp";

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

async function bindAuthorizationCodeToConsent(verification: Verification, isOperator: (userId: string) => Promise<boolean>) {
  let raw: unknown;
  try { raw = JSON.parse(verification.value); } catch { return; }
  // Verification also stores OTPs and social-provider state; leave those records alone.
  if (!raw || typeof raw !== "object" || !("type" in raw) || raw.type !== "authorization_code") return;
  const parsed = authorizationCodeGrantSchema.safeParse(raw);
  if (!parsed.success) rejectDisconnectedGrant();
  const grant = withoutOperatorScope(parsed.data, await isOperator(parsed.data.userId));
  const adapter = await getCurrentAdapter(getCurrentAuthEndpointContext().context.adapter);
  const consents = await adapter.findMany<OAuthConsent>({
    model: "oauthConsent", where: [{ field: "userId", value: grant.userId }, { field: "clientId", value: grant.query.client_id }],
  });
  const consent = consents.find(value => consentCoversGrant(value, grant));
  if (!consent) rejectDisconnectedGrant();
  // The database hook owns this binding; authorization request parameters cannot set it.
  return { data: { ...verification, value: JSON.stringify({ ...grant, mcpConsentId: consent.id }) } };
}

/** Removes `mcp:operator` from a code issued to a user who no longer holds an operator grant. */
function withoutOperatorScope(grant: AuthorizationCodeGrant, operator: boolean): AuthorizationCodeGrant {
  const scopes = grant.query.scope.split(/\s+/).filter(Boolean);
  if (operator || !scopes.includes(MCP_OPERATOR_SCOPE)) return grant;
  return { ...grant, query: { ...grant.query, scope: scopes.filter(scope => scope !== MCP_OPERATOR_SCOPE).join(" ") } };
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
  return normalizeResource(getBinding("MCP_OAUTH_RESOURCE") || MCP_OAUTH_DEFAULT_RESOURCE, "MCP_OAUTH_RESOURCE");
}

function normalizeResource(value: string, name: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || value.includes("?") || value.includes("#")) {
    throw new Error(`${name} must be HTTPS (or an explicit local loopback HTTP URL), without credentials, query, or fragment.`);
  }
  return url.href.replace(/\/$/, "");
}

/**
 * Resources that tokens issued before MCP moved into this worker are bound to (for example
 * https://mcp.nextlevelbuilder.io/mcp). The authorization server keeps issuing and refreshing tokens for
 * them so existing clients on the old host keep working.
 */
export function getMcpOAuthLegacyResources(): string[] {
  return (getBinding("MCP_OAUTH_LEGACY_RESOURCES") ?? "").split(",").map(value => value.trim()).filter(Boolean)
    .map(value => normalizeResource(value, "MCP_OAUTH_LEGACY_RESOURCES"));
}

export interface McpOAuthPluginOptions {
  /** Whether the user holds an unrevoked platform operator grant. Defaults to a `platform_operators` lookup. */
  isOperator?: (userId: string) => Promise<boolean>;
}

async function hasOperatorGrant(userId: string): Promise<boolean> {
  return (await getOperatorCapabilities(getDb(), userId)).length > 0;
}

/**
 * Where the authorize endpoint reads its parameters: the body of a POST to /oauth2/authorize, otherwise the
 * query. Resuming after sign-in or /oauth2/continue dispatches authorize from that POST with the stored query.
 */
function authorizeParamsSource(ctx: { method?: string; authorizeSettings?: { isAuthorize?: boolean } }): "body" | "query" {
  const isAuthorize = ctx.authorizeSettings ? ctx.authorizeSettings.isAuthorize === true : true;
  return ctx.method === "POST" && isAuthorize ? "body" : "query";
}

function splitScopes(value: unknown): string[] {
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

export function getMcpOAuthPlugins(options: McpOAuthPluginOptions = {}) {
  const isOperator = options.isOperator ?? hasOperatorGrant;
  const resource = getMcpOAuthResource();
  const legacyResources = getMcpOAuthLegacyResources().filter(value => value !== resource);
  const provider = mcp({
    loginPage: "/sign-in",
    consentPage: "/oauth/consent",
    resource,
    ...(legacyResources.length ? { resources: legacyResources } : {}),
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
    // Every client may target every MCP resource this server issues for. Per-client links would strand
    // clients registered before the resource moved to the web origin, and they add nothing while the
    // configured resources are all the same MCP server.
    enforcePerClientResources: false,
    identifierValidator: (identifier) => identifier === resource || legacyResources.includes(identifier),
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
    init: () => ({ options: { databaseHooks: { verification: { create: {
      before: (verification: Verification) => bindAuthorizationCodeToConsent(verification, isOperator),
    } } } } }),
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
          const source = authorizeParamsSource(ctx);
          const params: unknown = ctx[source];
          const values = params && typeof params === "object" ? params as Record<string, unknown> : {};
          if (values.resource !== undefined) return;
          return { context: { [source]: { ...values, resource } } };
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
  // Registration defaults application_type to "web", which forbids loopback redirects. Desktop and CLI MCP
  // clients register http://localhost or 127.0.0.1 callbacks (RFC 8252) without sending application_type,
  // so a registration whose redirects are all loopback or private-use schemes is treated as native.
  const nativeRegistrationDefault = {
    id: "mcp-native-registration-default",
    schema: {},
    hooks: {
      before: [{
        matcher: (ctx: HookEndpointContext) => ctx.path === "/oauth2/register",
        handler: createAuthMiddleware(async (ctx) => {
          const body: unknown = ctx.body;
          if (!body || typeof body !== "object") return;
          const values = body as Record<string, unknown>;
          if (values.application_type !== undefined || !Array.isArray(values.redirect_uris)) return;
          if (values.redirect_uris.length === 0 || !values.redirect_uris.every(isNativeRedirectUri)) return;
          return { context: { body: { ...values, application_type: "native" } } };
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
  // Clients ask for every advertised scope, so `mcp:operator` is requested on behalf of members too.
  // - Authorization requests drop it when the client was registered without it (clients registered before
  //   the scope existed keep their stored scopes) and, with a session, when the user has no operator grant,
  //   so members are not sent back to consent for a scope they cannot have.
  // - Consent drops it for a user without an operator grant, so their stored consent lacks it.
  // - Authorization codes drop it whenever the user has no grant at issue time, which covers the paths that
  //   skip consent (an existing consent, resuming after sign-in) for a grant revoked since consent.
  // Refresh tokens keep the scope they were issued with; the operator APIs check the grant on every call.
  const operatorScopeGate = {
    id: "mcp-operator-scope-gate",
    schema: {},
    hooks: {
      before: [{
        matcher: (ctx: HookEndpointContext) => ctx.path === "/oauth2/authorize",
        handler: createAuthMiddleware(async (ctx) => {
          const source = authorizeParamsSource(ctx);
          const params: unknown = ctx[source];
          const values = params && typeof params === "object" ? params as Record<string, unknown> : {};
          if (typeof values.client_id !== "string") return;
          if (values.scope !== undefined && !splitScopes(values.scope).includes(MCP_OPERATOR_SCOPE)) return;
          const client = await ctx.context.adapter.findOne<{ scopes?: string[] | null }>({
            model: "oauthClient", where: [{ field: "clientId", value: values.client_id }],
          });
          // The provider falls back to the client's scopes, then to the server's, when none are requested.
          const clientScopes = client?.scopes ?? MCP_OAUTH_SCOPES;
          const scopes = values.scope === undefined ? clientScopes : splitScopes(values.scope);
          if (!scopes.includes(MCP_OPERATOR_SCOPE)) return;
          let drop = !clientScopes.includes(MCP_OPERATOR_SCOPE);
          if (!drop) {
            const session = await getSessionFromCtx(ctx);
            drop = session !== null && !await isOperator(session.user.id);
          }
          const kept = scopes.filter(scope => scope !== MCP_OPERATOR_SCOPE);
          if (!drop || !kept.length) return;
          return { context: { [source]: { ...values, scope: kept.join(" ") } } };
        }),
      }, {
        matcher: (ctx: HookEndpointContext) => ctx.path === "/oauth2/consent",
        handler: createAuthMiddleware(async (ctx) => {
          const body: unknown = ctx.body;
          if (!body || typeof body !== "object") return;
          const values = body as Record<string, unknown>;
          if (values.accept !== true || typeof values.oauth_query !== "string") return;
          const scopes = values.scope === undefined
            ? splitScopes(new URLSearchParams(values.oauth_query).get("scope"))
            : splitScopes(values.scope);
          if (!scopes.includes(MCP_OPERATOR_SCOPE)) return;
          const session = await getSessionFromCtx(ctx);
          // Without a session the provider refuses the consent itself.
          if (!session || await isOperator(session.user.id)) return;
          const kept = scopes.filter(scope => scope !== MCP_OPERATOR_SCOPE);
          if (!kept.length) {
            throw new APIError("FORBIDDEN", { error: "access_denied", error_description: "mcp:operator needs a platform operator grant." });
          }
          return { context: { body: { ...values, scope: kept.join(" ") } } };
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
  return [jwt({ jwks: { keyPairConfig: { alg: "RS256" } } }), provider, consentBinding, defaultResource, nativeRegistrationDefault, operatorScopeGate];
}

function isNativeRedirectUri(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return false;
  if (url.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return true;
}
