import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { webcrypto } from "node:crypto";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { handleWorkerFetch, type WorkerEnv } from "../src/transports/worker.js";
import { createNlbMcpHttpHandler } from "../src/http.js";
import { oauthToolContext, resolveOAuthConfig } from "../src/oauth.js";
import { requiredToolScope } from "../src/tool-context.js";
import { readJsonRpcMessages } from "../src/transports/legacy-sse.js";
import { LEGACY, legacyRequest, modernRequest, type RpcResponse } from "./helpers.js";

describe("MCP OAuth resource server", () => {
  let upstream: Server;
  let env: WorkerEnv;
  let api: string;
  let issuer: string;
  let resource: string;
  let privateKey: CryptoKey;
  let upstreamRequests: Array<{ assertion?: string; authorization?: string; cookie?: string; path?: string; body: string; contentType?: string }> = [];
  const secret = "local-test-delegation-secret-at-least-32-bytes";

  beforeAll(async () => {
    // Workers expose Web Crypto globally; older Node test runners need the real Node implementation.
    if (!globalThis.crypto) vi.stubGlobal("crypto", webcrypto);
    const keys = await generateKeyPair("RS256");
    privateKey = keys.privateKey;
    const jwk = { ...await exportJWK(keys.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
    upstream = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/auth/jwks") {
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      upstreamRequests.push({
        assertion: req.headers["x-nlb-mcp-assertion"] as string | undefined,
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
        path: req.url,
        body: Buffer.concat(chunks).toString("utf8"),
        contentType: req.headers["content-type"]
      });
      if (req.url === "/api/redirect") {
        res.writeHead(302, { Location: "/api/redirect-target" }).end();
      } else if (req.url?.startsWith("/api/v1/products/test-product/traffic")) {
        res.end(JSON.stringify({ data: {
          source: "clickhouse", from: "2026-08-01T00:00:00Z", to: "2026-08-31T00:00:00Z",
          updatedAt: "2026-08-31T00:00:00Z", pageViews: 12, visitors: 8, outboundClicks: 3, activeVisitors: 1,
          series: [], referrers: [], countries: [], devices: []
        } }));
      } else {
        res.end(JSON.stringify({ success: true, data: [] }));
      }
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener");
    api = `http://127.0.0.1:${address.port}`;
    issuer = `${api}/api/auth`;
    resource = `${api}/mcp`;
    env = { NLB_OAUTH_ENABLED: "true", NLB_OAUTH_ISSUER: issuer, NLB_OAUTH_RESOURCE: resource,
      NLB_API_URL: api, MCP_DELEGATION_SECRET: secret, WORKER_AUTH_TOKEN: "legacy-token" };
  });

  afterAll(async () => {
    if (upstream) {
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    }
    vi.unstubAllGlobals();
  });

  async function token(claims: Record<string, unknown> = {}, signingKey = privateKey) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub: "user-1", iss: issuer, aud: resource, iat: now, exp: now + 300,
      scope: "mcp:read mcp:write mcp:keys", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "at+jwt" }).sign(signingKey);
  }

  const bearer = (value?: string): Record<string, string> => value ? { Authorization: `Bearer ${value}` } : {};

  async function call(name: string, authorization?: string, args: Record<string, unknown> = {}, config = env) {
    const response = await handleWorkerFetch(modernRequest("tools/call", { name, arguments: args }, bearer(authorization), resource), config);
    const messages = response.ok ? await readJsonRpcMessages(response.clone()) : [];
    const body = messages[0] as RpcResponse | undefined;
    const text = body?.result?.content?.[0]?.text;
    let payload: any;
    try {
      payload = text === undefined ? undefined : JSON.parse(text);
    } catch {
      // Input validation errors from the SDK are plain text, not JSON.
      payload = text;
    }
    return { status: response.status, response, body, isError: body?.result?.isError, payload };
  }

  const verifyAssertion = (assertion: string, iss = resource) => jwtVerify(assertion, new TextEncoder().encode(secret), {
    algorithms: ["HS256"], issuer: iss, audience: `${api}/api`, typ: "nlb-mcp-delegation+jwt"
  });

  it("serves RFC 9728 metadata at both locations", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const res = await handleWorkerFetch(new Request(new URL(path, resource)), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        resource, authorization_servers: [issuer], scopes_supported: ["mcp:read", "mcp:write", "mcp:keys"],
        bearer_methods_supported: ["header"], resource_name: "Next Level Builders MCP"
      });
    }
    expect((await handleWorkerFetch(new Request(new URL("/.well-known/oauth-protected-resource", resource)), { ...env, NLB_OAUTH_ENABLED: "false" })).status).toBe(404);
  });

  it("challenges anonymous protected calls with a 401 naming the PRM and every required scope", async () => {
    const res = await call("submit_product");
    expect(res.status).toBe(401);
    const challenge = res.response.headers.get("WWW-Authenticate")!;
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(`resource_metadata="${api}/.well-known/oauth-protected-resource/mcp"`);
    expect(challenge).toContain('scope="mcp:write"');
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).not.toContain("offline_access");
    expect(res.response.headers.get("Access-Control-Expose-Headers")).toContain("WWW-Authenticate");

    // A legacy batch needing two scopes gets one challenge with both.
    const batch = await handleWorkerFetch(new Request(resource, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "submit_product", arguments: {} } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_api_keys", arguments: {} } }
      ])
    }), env);
    expect(batch.status).toBe(401);
    expect(batch.headers.get("WWW-Authenticate")).toContain('scope="mcp:write mcp:keys"');
  });

  it("keeps public reads, static-token callers and the OAuth-disabled mode compatible", async () => {
    expect((await call("list_templates")).status).toBe(200);
    const legacy = await call("submit_product", "legacy-token");
    expect(legacy.status).toBe(200);
    expect(legacy.isError).toBe(true);
    const disabled = await call("submit_product", undefined, {}, { ...env, NLB_OAUTH_ENABLED: "false" });
    expect(disabled.status).toBe(200);
    expect(disabled.payload.error).toContain("Unauthorized");
  });

  it("uses a separate short-lived request-bound assertion without forwarding the OAuth token", async () => {
    upstreamRequests = [];
    const access = await token();
    const res = await call("list_api_keys", access);
    expect(res.status).toBe(200);
    expect(res.isError).toBe(false);
    expect(upstreamRequests).toHaveLength(1);
    const sent = upstreamRequests[0];
    expect(sent.authorization).toBeUndefined();
    expect(sent.cookie).toBeUndefined();
    expect(sent.assertion).not.toBe(access);
    const verified = await verifyAssertion(sent.assertion!);
    expect(verified.payload).toMatchObject({ sub: "user-1", scope: "mcp:keys", method: "GET", path: "/api/v1/api-keys" });
    expect(verified.payload.exp! - verified.payload.iat!).toBeLessThanOrEqual(60);
    expect(verified.payload.jti).toBeTruthy();
  });

  it("answers 403 insufficient_scope without leaking identity into a later anonymous request", async () => {
    const keys = await call("list_api_keys", await token({ scope: "mcp:write" }));
    expect(keys.status).toBe(403);
    const challenge = keys.response.headers.get("WWW-Authenticate")!;
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="mcp:keys"');
    expect(challenge).toContain("oauth-protected-resource/mcp");
    expect((await call("submit_product", await token({ scope: "mcp:read" }))).status).toBe(403);
    expect((await call("submit_product", await token())).status).toBe(200);
    expect((await call("submit_product")).status).toBe(401);
  });

  it("keeps blog reads public anonymously, signs them when authenticated, and gates blog writes on mcp:write", async () => {
    upstreamRequests = [];
    expect((await call("blog_list_posts")).status).toBe(200);
    expect(upstreamRequests[0]?.assertion).toBeUndefined();
    expect((await call("blog_list_revisions", undefined, { post_id: "p1" })).status).toBe(401);
    expect((await call("blog_publish_post", undefined, { post_id: "p1", version: 1 })).status).toBe(401);
    expect((await call("blog_publish_post", await token({ scope: "mcp:read" }), { post_id: "p1", version: 1 })).status).toBe(403);

    upstreamRequests = [];
    expect((await call("blog_get_post", await token({ scope: "mcp:read" }), { id_or_slug: "draft-post" })).status).toBe(200);
    expect(upstreamRequests).toHaveLength(1);
    const verified = await verifyAssertion(upstreamRequests[0].assertion!);
    expect(verified.payload).toMatchObject({ sub: "user-1", scope: "mcp:read", method: "GET", path: "/api/v1/blog/posts/draft-post" });

    upstreamRequests = [];
    expect((await call("blog_publish_post", await token(), { post_id: "p1", version: 1 })).status).toBe(200);
    expect(upstreamRequests[0]?.path).toBe("/api/v1/blog/posts/p1/publish");
    expect(upstreamRequests[0]?.assertion).toBeTruthy();
  });

  it("requires mcp:read for private traffic and signs its request without forwarding credentials", async () => {
    expect(requiredToolScope("get_product_traffic")).toBe("mcp:read");
    upstreamRequests = [];
    const anonymous = await call("get_product_traffic", undefined, { slug: "test-product" });
    expect(anonymous.status).toBe(401);
    expect(anonymous.response.headers.get("WWW-Authenticate")).toContain('scope="mcp:read"');
    expect((await call("get_product_traffic", await token({ scope: "mcp:write" }), { slug: "test-product" })).status).toBe(403);
    expect(upstreamRequests).toHaveLength(0);

    const access = await token({ scope: "mcp:read" });
    const result = await call("get_product_traffic", access, {
      slug: "test-product", from: "2026-08-01T00:00:00Z", to: "2026-08-31T00:00:00Z"
    }, { ...env, NLB_API_KEY: "nlb_live_shared_key_must_not_be_used" });
    expect(result.status).toBe(200);
    expect(result.isError).toBe(false);
    expect(result.payload.data.pageViews).toBe(12);
    expect(upstreamRequests).toHaveLength(1);
    const sent = upstreamRequests[0];
    expect(sent.authorization).toBeUndefined();
    expect(sent.cookie).toBeUndefined();
    const { payload: assertion } = await verifyAssertion(sent.assertion!);
    expect(assertion).toMatchObject({ sub: "user-1", scope: "mcp:read", method: "GET", path: "/api/v1/products/test-product/traffic" });
    for (const args of [{ api_key: "another-account" }, { api_url: "https://staging.nextlevelbuilder.io" }]) {
      expect((await call("get_product_traffic", access, { slug: "test-product", ...args })).isError).toBe(true);
    }
    expect(upstreamRequests).toHaveLength(1);
  });

  it("preserves JSON and multipart bodies through delegated POST requests", async () => {
    upstreamRequests = [];
    const access = await token();
    expect((await call("create_api_key", access, { name: "integration-test" })).isError).toBe(false);
    const upload = await call("upload_media", access, { filename: "test.svg", mime_type: "image/svg+xml", file_base64: btoa('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    expect(upload.isError).toBe(false);
    expect(upstreamRequests).toHaveLength(2);
    expect(JSON.parse(upstreamRequests[0].body)).toMatchObject({ name: "integration-test" });
    expect(upstreamRequests[1].contentType).toContain("multipart/form-data; boundary=");
    expect(upstreamRequests[1].body).toContain('filename="test.svg"');
    for (const [index, scope] of ["mcp:keys", "mcp:write"].entries()) {
      const { payload } = await jwtVerify(upstreamRequests[index].assertion!, new TextEncoder().encode(secret));
      expect(payload.method).toBe("POST");
      expect(payload.scope).toBe(scope);
    }
  });

  it("rejects expired, foreign-audience, foreign-issuer, future, overlong and incomplete tokens with 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const claims of [
      { exp: now - 1 }, { aud: "https://other.example/mcp" }, { iss: "https://other.example/auth" },
      { iat: now + 60, exp: now + 300 }, { iat: now, exp: now + 301 }, { sub: "" }, { scope: undefined }, { exp: undefined }
    ]) {
      const res = await call("list_templates", await token(claims));
      expect(res.status, JSON.stringify(claims)).toBe(401);
      expect(res.response.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
    }
    const other = await generateKeyPair("RS256");
    expect((await call("list_templates", await token({}, other.privateKey))).status).toBe(401);
    expect((await call("list_templates", "not-a-jwt")).status).toBe(401);
  });

  it("rejects credential and upstream overrides before making an API call", async () => {
    upstreamRequests = [];
    for (const args of [{ api_key: "another-account" }, { session_cookie: "another-session" }, { api_url: "https://staging.nextlevelbuilder.io" }]) {
      expect((await call("list_api_keys", await token(), args)).isError).toBe(true);
    }
    expect(upstreamRequests).toHaveLength(0);
  });

  it("uses Workers-supported manual redirects and rejects redirects or another API", async () => {
    const config = resolveOAuthConfig({ issuer, resource, apiUrl: api, delegationSecret: secret });
    const context = oauthToolContext(config, "user-1", ["mcp:write"], Math.floor(Date.now() / 1000) + 300, "submit_product");
    upstreamRequests = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(context.fetch!(`${api}/api/redirect`)).rejects.toThrow("OAuth API redirects are not allowed");
      // Node accepts redirect:error, but the deployed Workers runtime rejects that mode.
      expect((fetchSpy.mock.calls[0][0] as Request).redirect).toBe("manual");
    } finally {
      fetchSpy.mockRestore();
    }
    expect(upstreamRequests.map((r) => r.path)).toEqual(["/api/redirect"]);
    await expect(context.fetch!("https://untrusted.example/api/private")).rejects.toThrow("configured NLB API");
  });

  it("fails closed on incomplete OAuth configuration", async () => {
    expect((await call("submit_product", undefined, {}, { ...env, MCP_DELEGATION_SECRET: undefined })).status).toBe(503);
  });

  it("serves 2025-11-25 clients through the same OAuth gate", async () => {
    const init = await handleWorkerFetch(legacyRequest("initialize", {
      protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "legacy", version: "1" }
    }, {}, undefined, resource), env);
    expect(init.status).toBe(200);
    expect((await handleWorkerFetch(legacyRequest("tools/call", { name: "list_api_keys", arguments: {} }, {}, LEGACY, resource), env)).status).toBe(401);
    const scoped = await handleWorkerFetch(legacyRequest("tools/call", { name: "list_api_keys", arguments: {} }, bearer(await token({ scope: "mcp:read" })), LEGACY, resource), env);
    expect(scoped.status).toBe(403);
    const ok = await handleWorkerFetch(legacyRequest("tools/call", { name: "list_api_keys", arguments: {} }, bearer(await token()), LEGACY, resource), env);
    const [message] = await readJsonRpcMessages(ok) as RpcResponse[];
    expect(message.result!.isError).toBe(false);
  });

  it("answers the deprecated SSE bridge's POST with the OAuth challenge", async () => {
    const sse = await handleWorkerFetch(new Request(new URL("/sse", resource)), env);
    const reader = sse.body!.getReader();
    const endpoint = /data: (\S+)/.exec(new TextDecoder().decode((await reader.read()).value))![1];
    const res = await handleWorkerFetch(new Request(new URL(endpoint, resource), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "submit_product", arguments: {} } })
    }), env);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("oauth-protected-resource/mcp");
    await reader.cancel();
  });

  describe("in-process handler factory", () => {
    const legacyResource = "https://mcp.nextlevelbuilder.io/mcp";

    function handlerWith(outbound: typeof fetch, overrides: Partial<Parameters<typeof createNlbMcpHttpHandler>[0]> = {}) {
      return createNlbMcpHttpHandler({
        apiBaseUrl: api, oauthIssuer: issuer, resource, delegationSecret: secret,
        acceptedAudiences: [legacyResource], fetch: outbound, ...overrides
      });
    }

    it("routes only MCP paths and uses the injected fetch for JWKS and API calls", async () => {
      const seen: string[] = [];
      const outbound = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        seen.push(new URL(request.url).pathname);
        return fetch(request);
      }) as unknown as typeof fetch;
      const handler = handlerWith(outbound);
      expect(await handler(new Request(`${api}/blog`))).toBeNull();
      expect(await handler(new Request(`${api}/`))).toBeNull();
      expect((await handler(new Request(`${api}/.well-known/oauth-protected-resource/mcp`)))!.status).toBe(200);
      expect((await handler(new Request(`${api}/mcp`, { method: "GET" })))!.status).toBe(405);
      expect((await handler(new Request(`${api}/mcp`, { method: "DELETE" })))!.status).toBe(405);

      upstreamRequests = [];
      // A token minted for the previous endpoint URL is still accepted (acceptedAudiences).
      const res = await handler(modernRequest("tools/call", { name: "list_api_keys", arguments: {} }, bearer(await token({ aud: legacyResource })), `${api}/mcp`));
      expect(res!.status).toBe(200);
      expect(seen).toContain("/api/auth/jwks");
      expect(seen).toContain("/api/v1/api-keys");
      expect(upstreamRequests.at(-1)!.assertion).toBeTruthy();

      // Anonymous public reads also go through the injected fetch.
      seen.length = 0;
      await handler(modernRequest("tools/call", { name: "blog_list_posts", arguments: {} }, {}, `${api}/mcp`));
      expect(seen).toContain("/api/v1/blog/posts");
    });

    it("signs delegation assertions with delegationIssuer, defaulting to resource", async () => {
      upstreamRequests = [];
      const canonical = "https://nextlevelbuilder.io/mcp";
      const handler = handlerWith(fetch, { delegationIssuer: canonical });
      await handler(modernRequest("tools/call", { name: "list_api_keys", arguments: {} }, bearer(await token()), `${api}/mcp`));
      const { payload } = await verifyAssertion(upstreamRequests.at(-1)!.assertion!, canonical);
      expect(payload.aud).toBe(`${api}/api`);
    });

    it("refuses tokens for audiences that are neither the resource nor accepted", async () => {
      const handler = handlerWith(fetch, { acceptedAudiences: [] });
      const res = await handler(modernRequest("tools/list", {}, bearer(await token({ aud: legacyResource })), `${api}/mcp`));
      expect(res!.status).toBe(401);
    });
  });
});
