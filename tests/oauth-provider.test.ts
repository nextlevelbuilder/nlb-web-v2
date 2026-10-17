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

const origin = "http://localhost:3000";
const issuer = `${origin}/api/auth`;
const resource = "https://mcp.nextlevelbuilder.io/mcp";
const callback = "http://127.0.0.1:9876/callback";
const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
const challenge = createHash("sha256").update(verifier).digest("base64url");

async function fixture() {
  const plugins = getMcpOAuthPlugins();
  const database: Record<string, Record<string, unknown>[]> = {};
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
    return { ...loginState, code: redirect.searchParams.get("code")! };
  }
  const tokenBody = (code: string) => ({ grant_type: "authorization_code", client_id: client.client_id,
    code, code_verifier: verifier, redirect_uri: callback, resource });
  return { auth, database, request, client, query, login, approve, tokenBody, getOtp: () => otp };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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
