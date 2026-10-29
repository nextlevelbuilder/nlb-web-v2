import { afterEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins";
import { createHash } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { getMcpOAuthPlugins, getMcpOAuthResource, isMcpOAuthEnabled, MCP_OAUTH_SCOPES } from "@/lib/mcp-oauth-config";
import * as schema from "@/lib/db/schema";
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { clearClientIdMetadataCache } from "@/lib/mcp-oauth-cimd";
import { isInvalidOAuthSignatureError, isOAuthSignInQuery } from "@/lib/auth-oauth-sign-in-link";

const origin = "http://localhost:3000";
const issuer = `${origin}/api/auth`;
const resource = "https://nextlevelbuilder.io/mcp";
const callback = "http://127.0.0.1:9876/callback";
const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
const challenge = createHash("sha256").update(verifier).digest("base64url");

async function fixture(operators: string[] = []) {
  // Operator grants are checked by email here: the in-memory users get ids only when they sign in.
  const database: Record<string, Record<string, unknown>[]> = {};
  const plugins = getMcpOAuthPlugins({
    isOperator: async (userId) => operators.includes(String(database.user.find(user => user.id === userId)?.email)),
  });
  for (const model of ["user", "session", "account", "verification", ...plugins.flatMap(p => Object.keys(p.schema || {}))]) database[model] = [];
  let otp = "";
  const auth = betterAuth({
    baseURL: origin,
    secret: "oauth-provider-tests-only-secret-32-characters",
    database: memoryAdapter(database),
    rateLimit: { enabled: false },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    plugins: [emailOTP({ async sendVerificationOTP(value) { otp = value.otp; } }), ...plugins],
  });
  await auth.$context;
  async function request(path: string, body?: Record<string, unknown>, cookie?: string, form = false) {
    const headers = new Headers({ accept: "application/json", origin });
    if (cookie) headers.set("cookie", cookie);
    if (body) headers.set("content-type", form ? "application/x-www-form-urlencoded" : "application/json");
    return auth.handler(new Request(path.startsWith("http") ? path : `${issuer}${path}`, {
      method: body ? "POST" : "GET", headers,
      body: body ? form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body) : undefined,
    }));
  }
  const registration = await request("/oauth2/register", {
    client_name: "Local MCP test client", redirect_uris: [callback], application_type: "native",
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"], scope: MCP_OAUTH_SCOPES.join(" "),
  });
  expect(registration.status, await registration.clone().text()).toBe(201);
  const client = await registration.json();
  const query = new URLSearchParams({ client_id: client.client_id, response_type: "code", redirect_uri: callback,
    scope: MCP_OAUTH_SCOPES.join(" "), code_challenge: challenge, code_challenge_method: "S256", resource, state: "test-state" });
  async function login() {
    const authorization = await request(`/oauth2/authorize?${query}`);
    const next = await authorization.json();
    expect(next.url).toContain("/sign-in?");
    const oauthQuery = new URL(next.url, origin).search.slice(1);
    const sent = await request("/email-otp/send-verification-otp", { email: "builder@example.com", type: "sign-in" });
    expect(sent.status).toBe(200);
    const signedIn = await request("/sign-in/email-otp", { email: "builder@example.com", otp, oauth_query: oauthQuery });
    const signedInBody = await signedIn.json();
    expect(signedIn.status, JSON.stringify(signedInBody)).toBe(200);
    expect(signedInBody.url).toContain("/oauth/consent?");
    const cookie = signedIn.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect(cookie).toContain("session_token");
    return { cookie, oauthQuery: new URL(signedInBody.url, origin).search.slice(1) };
  }
  async function approve() {
    const loginState = await login();
    const consent = await request("/oauth2/consent", { accept: true, oauth_query: loginState.oauthQuery }, loginState.cookie);
    const body = await consent.json();
    expect(consent.status, JSON.stringify(body)).toBe(200);
    const redirect = new URL(body.url);
    expect(redirect.origin + redirect.pathname).toBe(callback);
    expect(redirect.searchParams.get("state")).toBe("test-state");
    // RFC 9207: every authorization response names the issuer from the metadata document.
    expect(redirect.searchParams.get("iss")).toBe(issuer);
    return { ...loginState, code: redirect.searchParams.get("code")! };
  }
  const tokenBody = (code: string) => ({ grant_type: "authorization_code", client_id: client.client_id,
    code, code_verifier: verifier, redirect_uri: callback, resource });
  return { auth, database, request, client, query, login, approve, tokenBody, getOtp: () => otp };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); clearClientIdMetadataCache(); });

describe("MCP OAuth provider", () => {
  it("defaults rollout off and validates explicit resources", () => {
    vi.stubEnv("MCP_OAUTH_ENABLED", "false");
    expect(isMcpOAuthEnabled()).toBe(false);
    vi.stubEnv("MCP_OAUTH_RESOURCE", "http://127.0.0.1:8787/mcp");
    expect(getMcpOAuthResource()).toBe("http://127.0.0.1:8787/mcp");
    for (const invalid of ["http://remote.example/mcp", "https://user:pass@server/mcp", "https://server/mcp?x=1", "https://server/mcp#x"]) {
      vi.stubEnv("MCP_OAUTH_RESOURCE", invalid);
      expect(() => getMcpOAuthResource()).toThrow();
    }
  });

  it("maps every provider and JWT field to the plural Drizzle schema", () => {
    const map = { oauthClient: schema.oauthClients, oauthResource: schema.oauthResources, oauthClientResource: schema.oauthClientResources,
      oauthRefreshToken: schema.oauthRefreshTokens, oauthAccessToken: schema.oauthAccessTokens, oauthConsent: schema.oauthConsents,
      oauthClientAssertion: schema.oauthClientAssertions, jwks: schema.jwksKeys };
    for (const plugin of getMcpOAuthPlugins()) for (const [model, definition] of Object.entries(plugin.schema!)) {
      const table = map[model as keyof typeof map];
      expect(table, model).toBeDefined();
      for (const field of Object.keys(definition.fields)) expect(Object.keys(table), `${model}.${field}`).toContain(field);
    }
  });

  it("forwards the browser signed query through the real OTP client and redirects to consent", async () => {
    const f = await fixture();
    const first = await (await f.request(`/oauth2/authorize?${f.query}`)).json();
    const location = { search: new URL(first.url, origin).search, href: first.url };
    vi.stubGlobal("window", { location });
    const client = createAuthClient({ baseURL: origin, plugins: [emailOTPClient(), oauthProviderClient()],
      fetchOptions: { customFetchImpl: async (input, init) => f.auth.handler(new Request(input, init)) } });
    const sent = await client.emailOtp.sendVerificationOtp({ email: "browser@example.com", type: "sign-in" });
    expect(sent.error).toBeNull();
    const signedIn = await client.signIn.emailOtp({ email: "browser@example.com", otp: f.getOtp() });
    expect(signedIn.error).toBeNull();
    expect(location.href).toContain("/oauth/consent?");
    // No authorization code is issued until an explicit consent decision.
    expect(new URL(location.href, origin).searchParams.has("code")).toBe(false);
    expect(f.database.oauthConsent).toHaveLength(0);
  });

  it("reports an expired authorize link as invalid_signature on the OTP request", async () => {
    const f = await fixture();
    const first = await (await f.request(`/oauth2/authorize?${f.query}`)).json();
    const params = new URL(first.url, origin).searchParams;
    const exp = Number(params.get("exp")) * 1000;
    vi.useFakeTimers({ toFake: ["Date"], now: exp + 1000 });
    try {
      vi.stubGlobal("window", { location: { search: `?${params}`, href: first.url } });
      const client = createAuthClient({ baseURL: origin, plugins: [emailOTPClient(), oauthProviderClient()],
        fetchOptions: { customFetchImpl: async (input, init) => f.auth.handler(new Request(input, init)) } });
      const sent = await client.emailOtp.sendVerificationOtp({ email: "late@example.com", type: "sign-in" });
      expect(sent.error?.status).toBe(400);
      expect(isInvalidOAuthSignatureError(sent.error)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("only treats signed authorize queries as OAuth sign-in links", () => {
    expect(isOAuthSignInQuery(new URLSearchParams("callbackUrl=/studio"))).toBe(false);
    expect(isOAuthSignInQuery(new URLSearchParams("sig=x&ba_param=exp"))).toBe(true);
    expect(isInvalidOAuthSignatureError({ status: 400, message: "Invalid OTP" })).toBe(false);
    expect(isInvalidOAuthSignatureError(null)).toBe(false);
  });

  it("revokes refresh tokens when the owner disconnects and rejects cross-user or CSRF deletion", async () => {
    const f = await fixture();
    const approval = await f.approve();
    const issued = await (await f.request("/oauth2/token", f.tokenBody(approval.code), undefined, true)).json();
    const consentId = f.database.oauthConsent[0].id;
    await f.request("/email-otp/send-verification-otp", { email: "other@example.com", type: "sign-in" });
    const otherLogin = await f.request("/sign-in/email-otp", { email: "other@example.com", otp: f.getOtp() });
    const otherCookie = otherLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect((await f.request("/oauth2/delete-consent", { id: consentId }, otherCookie)).status).toBe(401);
    expect((await f.request("/oauth2/delete-consent", { id: consentId })).status).toBe(401);
    const csrf = await f.auth.handler(new Request(`${issuer}/oauth2/delete-consent`, { method: "POST",
      headers: { origin: "https://attacker.example", cookie: approval.cookie, "content-type": "application/json" },
      body: JSON.stringify({ id: consentId }) }));
    expect(csrf.status).toBe(403);
    expect(f.database.oauthConsent).toHaveLength(1);
    expect(f.database.oauthRefreshToken[0].revoked).toBeFalsy();
    const deleted = await f.request("/oauth2/delete-consent", { id: consentId }, approval.cookie);
    expect(deleted.status).toBe(200);
    expect(f.database.oauthConsent).toHaveLength(0);
    const refreshed = await f.request("/oauth2/token", { grant_type: "refresh_token", client_id: f.client.client_id, refresh_token: issued.refresh_token, resource }, undefined, true);
    expect(refreshed.status).toBe(400);
    expect(f.database.jwks.length).toBeGreaterThan(0);
  });

  it("rejects rotated refresh-token reuse and invalidates the remaining family", async () => {
    const f = await fixture();
    const { code } = await f.approve();
    const issued = await (await f.request("/oauth2/token", f.tokenBody(code), undefined, true)).json();
    const refresh = (token: string) => f.request("/oauth2/token", { grant_type: "refresh_token", client_id: f.client.client_id, refresh_token: token, resource }, undefined, true);
    const rotated = await (await refresh(issued.refresh_token)).json();
    expect((await refresh(issued.refresh_token)).status).toBe(400);
    expect((await refresh(rotated.refresh_token)).status).toBe(400);
  });

  it("rejects a pending authorization code after the owner disconnects", async () => {
    const f = await fixture();
    const approval = await f.approve();
    expect((await f.request("/oauth2/delete-consent", { id: f.database.oauthConsent[0].id }, approval.cookie)).status).toBe(200);
    const exchanged = await f.request("/oauth2/token", f.tokenBody(approval.code), undefined, true);
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toMatchObject({ error: "invalid_grant" });
    expect(f.database.oauthRefreshToken).toHaveLength(0);
  });

  it.each(["same", "narrower"])("does not revive old authorization codes after %s re-consent", async (scopeChange) => {
    const f = await fixture();
    const original = await f.approve();
    const originalConsentId = f.database.oauthConsent[0].id;
    expect((await f.request("/oauth2/delete-consent", { id: originalConsentId }, original.cookie)).status).toBe(200);
    if (scopeChange === "narrower") f.query.set("scope", "mcp:read offline_access");
    const renewed = await f.approve();
    expect(f.database.oauthConsent[0].id).not.toBe(originalConsentId);
    const oldExchange = await f.request("/oauth2/token", f.tokenBody(original.code), undefined, true);
    expect(oldExchange.status).toBe(400);
    expect(await oldExchange.json()).toMatchObject({ error: "invalid_grant" });
    expect(f.database.oauthRefreshToken).toHaveLength(0);
    const newExchange = await f.request("/oauth2/token", f.tokenBody(renewed.code), undefined, true);
    expect(newExchange.status).toBe(200);
    const tokenResponse = await newExchange.json();
    expect(tokenResponse).not.toHaveProperty("mcpConsentId");
    if (scopeChange === "narrower") expect(tokenResponse.scope).not.toContain("mcp:keys");
  });

  it("keeps another client's pending authorization code valid when disconnecting", async () => {
    const f = await fixture();
    const original = await f.approve();
    const secondClientResponse = await f.request("/oauth2/register", {
      client_name: "Second MCP client", redirect_uris: [callback], application_type: "native",
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    });
    expect(secondClientResponse.status).toBe(201);
    const secondClient = await secondClientResponse.json();
    f.query.set("client_id", secondClient.client_id);
    const second = await f.approve();
    const secondConsent = f.database.oauthConsent.find(value => value.clientId === secondClient.client_id)!;
    expect((await f.request("/oauth2/delete-consent", { id: secondConsent.id }, second.cookie)).status).toBe(200);
    const firstExchange = await f.request("/oauth2/token", f.tokenBody(original.code), undefined, true);
    expect(firstExchange.status).toBe(200);
  });

  it("discovers endpoints and completes OTP, consent, S256 exchange, rotation and revocation", async () => {
    const f = await fixture();
    const metadata = await f.request(`${origin}/.well-known/oauth-authorization-server/api/auth`);
    expect(metadata.status).toBe(200);
    const discovery = await metadata.json();
    expect(discovery.issuer).toBe(issuer);
    expect(discovery.registration_endpoint).toBe(`${issuer}/oauth2/register`);
    expect(discovery.code_challenge_methods_supported).toEqual(["S256"]);
    expect(discovery.grant_types_supported).not.toContain("client_credentials");
    const approved = await f.approve();
    const token = await f.request("/oauth2/token", f.tokenBody(approved.code), undefined, true);
    const issued = await token.json();
    expect(token.status, JSON.stringify(issued)).toBe(200);
    expect(issued.expires_in).toBe(300);
    expect(issued.refresh_token).toBeTruthy();
    const jwks = await (await f.request("/jwks")).json();
    const { payload, protectedHeader } = await jwtVerify(issued.access_token, createLocalJWKSet(jwks), { issuer, audience: resource });
    expect(protectedHeader.typ).toBe("at+jwt");
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.sub).toBe(f.database.user[0].id);
    expect(payload.scope).toContain("mcp:keys");
    expect(payload.exp! - payload.iat!).toBe(300);
    await expect(jwtVerify(issued.access_token, createLocalJWKSet(jwks), { issuer, audience: "https://wrong.example/mcp" })).rejects.toThrow();
    const refreshed = await f.request("/oauth2/token", { grant_type: "refresh_token", client_id: f.client.client_id, refresh_token: issued.refresh_token, resource }, undefined, true);
    const rotated = await refreshed.json();
    expect(refreshed.status, JSON.stringify(rotated)).toBe(200);
    expect(rotated.refresh_token).not.toBe(issued.refresh_token);
    const revoked = await f.request("/oauth2/revoke", { client_id: f.client.client_id, token: rotated.refresh_token, token_type_hint: "refresh_token" }, undefined, true);
    expect(revoked.status).toBe(200);
    const denied = await f.request("/oauth2/token", { grant_type: "refresh_token", client_id: f.client.client_id, refresh_token: rotated.refresh_token, resource }, undefined, true);
    expect(denied.status).toBe(400);
  });

  it("rejects unsigned consent and lets a user deny a real request", async () => {
    const f = await fixture();
    const login = await f.login();
    const tampered = login.oauthQuery.replace("mcp%3Aread", "mcp%3Aadmin");
    const rejected = await f.request("/oauth2/consent", { accept: true, oauth_query: tampered }, login.cookie);
    expect(rejected.status).toBe(400);
    const denied = await f.request("/oauth2/consent", { accept: false, oauth_query: login.oauthQuery }, login.cookie);
    const body = await denied.json();
    expect(new URL(body.url).searchParams.get("error")).toBe("access_denied");
    expect(f.database.oauthConsent).toHaveLength(0);
  });

  it("drops mcp:operator from the grant of a user without an operator grant", async () => {
    const f = await fixture();
    expect(f.query.get("scope")).toContain("mcp:operator");
    const approved = await f.approve();
    expect(f.database.oauthConsent[0].scopes).not.toContain("mcp:operator");
    const issued = await (await f.request("/oauth2/token", f.tokenBody(approved.code), undefined, true)).json();
    expect(issued.scope.split(" ")).toEqual(expect.arrayContaining(["mcp:read", "mcp:write", "mcp:keys"]));
    expect(issued.scope).not.toContain("mcp:operator");
    // A signed-in member authorizing again is not sent back to consent for a scope they cannot hold.
    const again = await (await f.request(`/oauth2/authorize?${f.query}`, undefined, approved.cookie)).json();
    expect(new URL(again.url).searchParams.get("code")).toBeTruthy();
  });

  it("grants mcp:operator to a platform operator", async () => {
    const f = await fixture(["builder@example.com"]);
    const approved = await f.approve();
    expect(f.database.oauthConsent[0].scopes).toContain("mcp:operator");
    const issued = await (await f.request("/oauth2/token", f.tokenBody(approved.code), undefined, true)).json();
    expect(issued.scope).toContain("mcp:operator");
  });

  it("lets a client registered before mcp:operator existed authorize with every advertised scope", async () => {
    const f = await fixture(["builder@example.com"]);
    f.database.oauthClient[0].scopes = ["mcp:read", "mcp:write", "mcp:keys", "offline_access"];
    const approved = await f.approve();
    const issued = await (await f.request("/oauth2/token", f.tokenBody(approved.code), undefined, true)).json();
    expect(issued.scope).toBe("mcp:read mcp:write mcp:keys offline_access");
  });

  it("sends a member who signs in again straight back to the client without a second consent", async () => {
    const f = await fixture();
    await f.approve();
    f.database.session.length = 0;
    const next = await (await f.request(`/oauth2/authorize?${f.query}`)).json();
    const oauthQuery = new URL(next.url, origin).search.slice(1);
    await f.request("/email-otp/send-verification-otp", { email: "builder@example.com", type: "sign-in" });
    const resumed = await (await f.request("/sign-in/email-otp", { email: "builder@example.com", otp: f.getOtp(), oauth_query: oauthQuery })).json();
    expect(new URL(resumed.url).searchParams.get("code")).toBeTruthy();
  });

  it("drops mcp:operator from codes issued after the operator grant is revoked", async () => {
    const operators = ["builder@example.com"];
    const f = await fixture(operators);
    const approved = await f.approve();
    expect(f.database.oauthConsent[0].scopes).toContain("mcp:operator");
    operators.length = 0;
    const omitted = new URLSearchParams(f.query);
    omitted.delete("scope");
    for (const query of [f.query, omitted]) {
      const again = await (await f.request(`/oauth2/authorize?${query}`, undefined, approved.cookie)).json();
      const code = new URL(again.url).searchParams.get("code")!;
      const issued = await (await f.request("/oauth2/token", f.tokenBody(code), undefined, true)).json();
      expect(issued.scope).toBe("mcp:read mcp:write mcp:keys offline_access");
    }
    // Resuming after sign-in skips consent because the old consent covers the request.
    f.database.session.length = 0;
    const next = await (await f.request(`/oauth2/authorize?${f.query}`)).json();
    await f.request("/email-otp/send-verification-otp", { email: "builder@example.com", type: "sign-in" });
    const resumed = await (await f.request("/sign-in/email-otp", {
      email: "builder@example.com", otp: f.getOtp(), oauth_query: new URL(next.url, origin).search.slice(1),
    })).json();
    const code = new URL(resumed.url).searchParams.get("code")!;
    const issued = await (await f.request("/oauth2/token", f.tokenBody(code), undefined, true)).json();
    expect(issued.scope).not.toContain("mcp:operator");
  });

  it("refuses a consent that would only grant mcp:operator to a non-operator", async () => {
    const f = await fixture();
    f.query.set("scope", "mcp:operator");
    const login = await f.login();
    const consent = await f.request("/oauth2/consent", { accept: true, oauth_query: login.oauthQuery }, login.cookie);
    expect(consent.status).toBe(403);
    expect(f.database.oauthConsent).toHaveLength(0);
    // Asking for the scope explicitly does not get around the gate either.
    const explicit = await f.request("/oauth2/consent", { accept: true, scope: "mcp:operator", oauth_query: login.oauthQuery }, login.cookie);
    expect(explicit.status).toBe(403);
  });

  it.each(["missing-pkce", "plain-pkce", "unknown-scope", "wrong-resource", "wrong-redirect"])("rejects authorization with %s", async (kind) => {
    const f = await fixture();
    if (kind === "missing-pkce") { f.query.delete("code_challenge"); f.query.delete("code_challenge_method"); }
    if (kind === "plain-pkce") f.query.set("code_challenge_method", "plain");
    if (kind === "unknown-scope") f.query.set("scope", "mcp:admin");
    if (kind === "wrong-resource") f.query.set("resource", "https://wrong.example/mcp");
    if (kind === "wrong-redirect") f.query.set("redirect_uri", "https://attacker.example/callback");
    const response = await f.request(`/oauth2/authorize?${f.query}`);
    const body = await response.json();
    expect(body.url || "").not.toContain("/sign-in?");
    expect(body.error || (body.url && new URL(body.url).searchParams.get("error"))).toBeTruthy();
  });

  it.each(["wrong-verifier", "wrong-redirect", "wrong-client", "reused-code"])("rejects code exchange with %s", async (kind) => {
    const f = await fixture();
    const { code } = await f.approve();
    const body = f.tokenBody(code);
    if (kind === "wrong-verifier") body.code_verifier = "x".repeat(64);
    if (kind === "wrong-redirect") body.redirect_uri = "http://127.0.0.1:9876/other";
    if (kind === "wrong-client") body.client_id = "other-client";
    if (kind === "reused-code") expect((await f.request("/oauth2/token", body, undefined, true)).status).toBe(200);
    const response = await f.request("/oauth2/token", body, undefined, true);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

const metadataDocumentUrl = "https://client.example.com/oauth/metadata.json";
const metadataDocument = {
  client_id: metadataDocumentUrl, client_name: "Metadata document MCP client", client_uri: "https://client.example.com/",
  redirect_uris: [callback], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  token_endpoint_auth_method: "none",
};

function stubMetadataFetch(body: unknown = metadataDocument) {
  const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function redirectLocation(response: Response): Promise<string> {
  return response.headers.get("location") ?? (await response.json()).url ?? "";
}

describe("MCP authorization spec 2026-07-28 compliance", () => {
  it("advertises RFC 8414 metadata at both discovery locations and no OpenID configuration", async () => {
    const f = await fixture();
    for (const path of [`${origin}/.well-known/oauth-authorization-server/api/auth`, `${issuer}/.well-known/oauth-authorization-server`]) {
      const response = await f.request(path);
      expect(response.status, path).toBe(200);
      const metadata = await response.json();
      expect(metadata).toMatchObject({
        issuer, authorization_endpoint: `${issuer}/oauth2/authorize`, token_endpoint: `${issuer}/oauth2/token`,
        registration_endpoint: `${issuer}/oauth2/register`, code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true, client_id_metadata_document_supported: true,
        response_types_supported: ["code"],
      });
      expect(metadata.scopes_supported).toEqual(MCP_OAUTH_SCOPES);
      expect([...metadata.grant_types_supported].sort()).toEqual(["authorization_code", "refresh_token"]);
      expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
    }
    // Without the openid scope the provider is OAuth-only and must not pose as an OpenID provider.
    expect((await f.request("/.well-known/openid-configuration")).status).toBe(404);
  });

  it.each(["plain-pkce", "missing-pkce", "denied"])("includes iss in the %s error redirect", async (kind) => {
    const f = await fixture();
    let location: string;
    if (kind === "denied") {
      const login = await f.login();
      location = await redirectLocation(await f.request("/oauth2/consent", { accept: false, oauth_query: login.oauthQuery }, login.cookie));
    } else {
      if (kind === "plain-pkce") f.query.set("code_challenge_method", "plain");
      else { f.query.delete("code_challenge"); f.query.delete("code_challenge_method"); }
      location = await redirectLocation(await f.request(`/oauth2/authorize?${f.query}`));
    }
    const redirect = new URL(location);
    expect(redirect.origin + redirect.pathname).toBe(callback);
    expect(redirect.searchParams.get("error")).toBe(kind === "denied" ? "access_denied" : "invalid_request");
    expect(redirect.searchParams.get("iss")).toBe(issuer);
    expect(redirect.searchParams.get("state")).toBe("test-state");
  });

  it("rejects a plain PKCE verifier at the token endpoint even when it equals the challenge", async () => {
    const f = await fixture();
    const { code } = await f.approve();
    const response = await f.request("/oauth2/token", { ...f.tokenBody(code), code_verifier: challenge }, undefined, true);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).not.toHaveProperty("access_token");
  });

  it("does not support the implicit flow", async () => {
    const f = await fixture();
    f.query.set("response_type", "token");
    const location = await redirectLocation(await f.request(`/oauth2/authorize?${f.query}`));
    expect(location).not.toContain("access_token");
    expect(location).not.toContain("/sign-in?");
  });

  it.each(["password", "client_credentials"])("does not support the %s grant", async (grantType) => {
    const f = await fixture();
    const response = await f.request("/oauth2/token", { grant_type: grantType, client_id: f.client.client_id,
      username: "builder@example.com", password: "x", scope: "mcp:read", resource }, undefined, true);
    expect(response.status).toBe(400);
  });

  it("rejects a code exchange for a resource other than the authorized one", async () => {
    const f = await fixture();
    const { code } = await f.approve();
    const mismatched = await f.request("/oauth2/token", { ...f.tokenBody(code), resource: "https://wrong.example/mcp" }, undefined, true);
    expect(mismatched.status).toBe(400);
    expect(await mismatched.json()).not.toHaveProperty("access_token");
  });

  it("binds token audience to the requested resource, also when the client omits it", async () => {
    for (const sendResource of [true, false]) {
      const f = await fixture();
      if (!sendResource) f.query.delete("resource");
      const { code } = await f.approve();
      const body: Record<string, unknown> = f.tokenBody(code);
      if (!sendResource) delete body.resource;
      const issued = await (await f.request("/oauth2/token", body, undefined, true)).json();
      const jwks = await (await f.request("/jwks")).json();
      const { payload } = await jwtVerify(issued.access_token, createLocalJWKSet(jwks), { issuer });

      expect([payload.aud].flat()).toEqual([resource]);
      const refreshElsewhere = await f.request("/oauth2/token", { grant_type: "refresh_token", client_id: f.client.client_id,
        refresh_token: issued.refresh_token, resource: "https://wrong.example/mcp" }, undefined, true);
      expect(refreshElsewhere.status).toBe(400);
    }
  });

  it("keeps issuing and refreshing tokens for a configured legacy resource", async () => {
    const legacy = "https://mcp.nextlevelbuilder.io/mcp";
    vi.stubEnv("MCP_OAUTH_LEGACY_RESOURCES", `${legacy}/`);
    const f = await fixture();
    f.query.set("resource", legacy);
    const { code } = await f.approve();
    const issued = await (await f.request("/oauth2/token", { ...f.tokenBody(code), resource: legacy }, undefined, true)).json();
    const jwks = await (await f.request("/jwks")).json();
    const { payload } = await jwtVerify(issued.access_token, createLocalJWKSet(jwks), { issuer, audience: legacy });
    expect([payload.aud].flat()).toEqual([legacy]);
    const refreshed = await f.request("/oauth2/token", { grant_type: "refresh_token", client_id: f.client.client_id,
      refresh_token: issued.refresh_token, resource: legacy }, undefined, true);
    expect(refreshed.status, await refreshed.clone().text()).toBe(200);
  });

  it("rejects a malformed legacy resource", () => {
    vi.stubEnv("MCP_OAUTH_LEGACY_RESOURCES", "http://mcp.example.com/mcp");
    expect(() => getMcpOAuthPlugins()).toThrow(/MCP_OAUTH_LEGACY_RESOURCES/);
  });

  it("binds a POST authorization request without resource to the MCP resource", async () => {
    const f = await fixture();
    f.query.delete("resource");
    const body = await (await f.request("/oauth2/authorize", Object.fromEntries(f.query), undefined, true)).json();
    expect(body.url).toContain("/sign-in?");
    expect(new URL(body.url, origin).searchParams.get("resource")).toBe(resource);
  });

  it("keeps Dynamic Client Registration with application_type and requires exact redirect matching", async () => {
    const f = await fixture();
    const web = await f.request("/oauth2/register", { client_name: "Web MCP client", redirect_uris: ["https://client.example.org/callback"],
      application_type: "web", token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] });
    expect(web.status, await web.clone().text()).toBe(201);
    expect(await web.json()).toMatchObject({ application_type: "web", token_endpoint_auth_method: "none" });
    for (const redirect of ["http://localhost:33418/callback", "http://127.0.0.1:8976/callback", "com.example.mcp:/oauth/callback"]) {
      const native = await f.request("/oauth2/register", { client_name: "Desktop MCP client", redirect_uris: [redirect],
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
      expect(native.status, await native.clone().text()).toBe(201);
      expect(await native.json()).toMatchObject({ application_type: "native" });
    }
    const mixed = await f.request("/oauth2/register", { client_name: "Mixed", token_endpoint_auth_method: "none",
      redirect_uris: ["http://localhost:33418/callback", "https://client.example.org/callback"] });
    expect(mixed.status).toBe(400);
    const plainHttp = await f.request("/oauth2/register", { client_name: "Plain HTTP", token_endpoint_auth_method: "none",
      redirect_uris: ["http://client.example.org/callback"] });
    expect(plainHttp.status).toBe(400);
    const invalid = await f.request("/oauth2/register", { client_name: "Bad", redirect_uris: [callback], application_type: "desktop",
      token_endpoint_auth_method: "none" });
    expect(invalid.status).toBe(400);
    // A registration cannot opt out of PKCE: the flag is dropped and authorize still demands a challenge.
    const noPkce = await f.request("/oauth2/register", { client_name: "No PKCE", redirect_uris: [callback],
      token_endpoint_auth_method: "none", require_pkce: false });
    const noPkceClient = await noPkce.json();
    expect(noPkceClient.require_pkce).not.toBe(false);
    const withoutChallenge = new URLSearchParams(f.query);
    withoutChallenge.set("client_id", noPkceClient.client_id);
    withoutChallenge.delete("code_challenge");
    withoutChallenge.delete("code_challenge_method");
    const noPkceLocation = await redirectLocation(await f.request(`/oauth2/authorize?${withoutChallenge}`));
    expect(noPkceLocation).not.toContain("/sign-in?");
    for (const redirect of [`${callback}/extra`, `${callback}?x=1`, "http://127.0.0.1:9876/Callback"]) {
      f.query.set("redirect_uri", redirect);
      const location = await redirectLocation(await f.request(`/oauth2/authorize?${f.query}`));
      expect(location, redirect).not.toContain("/sign-in?");
      expect(location, redirect).not.toContain("127.0.0.1");
    }
  });

  it("authorizes a Client ID Metadata Document client without registration", async () => {
    const fetchMock = stubMetadataFetch();
    const f = await fixture();
    f.query.set("client_id", metadataDocumentUrl);
    const { code } = await f.approve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requested, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requested).toBe(metadataDocumentUrl);
    expect(init.redirect).toBe("manual");
    const stored = f.database.oauthClient.find(value => value.clientId === metadataDocumentUrl)!;
    expect(stored).toMatchObject({ clientDiscoveryId: "cimd", tokenEndpointAuthMethod: "none", name: "Metadata document MCP client" });
    expect(stored.clientSecret).toBeFalsy();
    const response = await f.request("/oauth2/token", { ...f.tokenBody(code), client_id: metadataDocumentUrl }, undefined, true);
    const issued = await response.json();
    expect(response.status, JSON.stringify(issued)).toBe(200);
    const jwks = await (await f.request("/jwks")).json();
    const { payload } = await jwtVerify(issued.access_token, createLocalJWKSet(jwks), { issuer, audience: resource });
    expect(payload.azp ?? payload.client_id).toBe(metadataDocumentUrl);
    // A fresh document is served from cache instead of being fetched on every request.
    await f.request(`/oauth2/authorize?${f.query}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates a metadata document the client marks no-store", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json(metadataDocument, { headers: { "cache-control": "no-store" } }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    f.query.set("client_id", metadataDocumentUrl);
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = await (await f.request(`/oauth2/authorize?${f.query}`)).json();
      expect(body.url).toContain("/sign-in?");
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(f.database.oauthClient.filter(value => value.clientId === metadataDocumentUrl)).toHaveLength(1);
  });

  it.each([
    ["loopback IP", "https://127.0.0.1/oauth/client.json"],
    ["localhost", "https://localhost/oauth/client.json"],
    ["private IP", "https://10.0.0.8/oauth/client.json"],
    ["cloud metadata", "https://169.254.169.254/latest/meta-data"],
    ["mapped IPv6 loopback", "https://[::ffff:127.0.0.1]/oauth/client.json"],
    ["non-default port", "https://client.example.com:8443/oauth/client.json"],
    ["credentials", "https://user:pass@client.example.com/oauth/client.json"],
    ["dot segments", "https://client.example.com/oauth/%2e%2e/client.json"],
  ])("refuses to fetch a metadata document from a %s client_id", async (_kind, clientId) => {
    const fetchMock = stubMetadataFetch({ ...metadataDocument, client_id: clientId });
    const f = await fixture();
    f.query.set("client_id", clientId);
    const location = await redirectLocation(await f.request(`/oauth2/authorize?${f.query}`));
    expect(location).not.toContain("/sign-in?");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(f.database.oauthClient.some(value => value.clientId === clientId)).toBe(false);
  });

  it.each([
    ["redirect", () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/" } })],
    ["mismatched client_id", () => Response.json({ ...metadataDocument, client_id: "https://other.example.com/oauth/metadata.json" })],
    ["oversized body", () => Response.json({ ...metadataDocument, client_name: "x".repeat(6 * 1024) })],
    ["non-JSON content type", () => new Response(JSON.stringify(metadataDocument), { headers: { "content-type": "text/html" } })],
    ["client secret", () => Response.json({ ...metadataDocument, client_secret: "not-a-real-secret" })],
    ["shared-secret auth method", () => Response.json({ ...metadataDocument, token_endpoint_auth_method: "client_secret_post" })],
    ["missing client_name", () => Response.json({ ...metadataDocument, client_name: undefined })],
    ["foreign client_uri", () => Response.json({ ...metadataDocument, client_uri: "https://attacker.example/" })],
    ["HTTP error", () => new Response("not found", { status: 404 })],
  ])("rejects a metadata document with a %s", async (_kind, respond) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));
    const f = await fixture();
    f.query.set("client_id", metadataDocumentUrl);
    const response = await f.request(`/oauth2/authorize?${f.query}`);
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(400);
    expect(["invalid_client", "invalid_client_metadata"]).toContain(body.error);
    expect(f.database.oauthClient.some(value => value.clientId === metadataDocumentUrl)).toBe(false);
  });

  it("rejects a redirect_uri that the metadata document does not list", async () => {
    stubMetadataFetch();
    const f = await fixture();
    f.query.set("client_id", metadataDocumentUrl);
    f.query.set("redirect_uri", "http://127.0.0.1:9876/elsewhere");
    const location = await redirectLocation(await f.request(`/oauth2/authorize?${f.query}`));
    expect(location).not.toContain("/sign-in?");
    expect(location).not.toContain("/elsewhere");
  });
});
