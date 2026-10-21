import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, type JWTPayload } from "jose";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { resolveCaller } from "@/lib/auth-api-key";
import { MCP_ASSERTION_HEADER, verifyMcpDelegation } from "@/lib/auth-mcp-delegation";
import { users, products, members, productRevisions, apiKeys } from "@/lib/db/schema";
import { POST as createProduct } from "@/app/api/v1/products/route";
import { POST as createRevision } from "@/app/api/v1/products/[slug]/revisions/route";
import { POST as submitProduct } from "@/app/api/v1/products/[slug]/submit/route";
import { POST as vote } from "@/app/api/v1/votes/route";
import { GET as listKeys, POST as createKey } from "@/app/api/v1/api-keys/route";
import { DELETE as deleteKey } from "@/app/api/v1/api-keys/[id]/route";
import { POST as upload } from "@/app/api/v1/media/upload/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { GET as adminQueue } from "@/app/api/v1/admin/queue/route";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), db: vi.fn(), cloudflare: vi.fn(),
  draft: vi.fn(), revision: vi.fn(), submit: vi.fn(), checks: vi.fn(),
  earlyBird: vi.fn(), checkout: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: mocks.session } }) }));
vi.mock("@/lib/db", () => ({ getDb: mocks.db }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: mocks.cloudflare }));
vi.mock("@/lib/domain/catalog", () => ({
  createProductDraft: mocks.draft, createProductRevision: mocks.revision,
  getPublishedProducts: vi.fn(), claimEarlyBirdSlot: mocks.earlyBird,
}));
vi.mock("@/lib/domain/moderation", () => ({
  submitRevisionForReview: mocks.submit, executeAutomatedChecks: mocks.checks,
}));
vi.mock("@/lib/polar", () => ({
  createCheckoutSession: mocks.checkout,
  PRODUCT_IDS: {
    PREMIUM_QUARTERLY: "premium-q", PREMIUM_ANNUAL: "premium-a",
    VIP_QUARTERLY: "vip-q", VIP_ANNUAL: "vip-a",
    PUBLISHING_TOOLKIT_EARLY_BIRD: "early", PUBLISHING_TOOLKIT_STANDARD: "standard",
  },
}));

const SECRET = "test-mcp-delegation-secret-with-at-least-32-bytes";
const ISSUER = "https://nextlevelbuilder.io/mcp";
const ORIGIN = "https://nextlevelbuilder.io";
const context = { scope: "mcp:write" as const, method: "POST", path: "/api/v1/products" };
const account = {
  id: "user-1", name: "Current name", email: "current@example.com", role: "user",
  emailVerified: true, image: null, banned: false, banExpires: null,
};
const revisionId = "a0000000-0000-4000-8000-000000000001";

async function sign(claims: JWTPayload = {}, header = { alg: "HS256", typ: "nlb-mcp-delegation+jwt" }, secret = SECRET) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: ISSUER, aud: `${ORIGIN}/api`, sub: account.id, jti: crypto.randomUUID(),
    iat: now, exp: now + 60, ...context, ...claims,
  }).setProtectedHeader(header).sign(new TextEncoder().encode(secret));
}

/** In-memory stand-in for the MCP_DELEGATION_JTI KV namespace. */
function fakeKv() {
  const values = new Map<string, string>();
  const put = vi.fn(async (key: string, value: string, _options: { expirationTtl: number }) => { values.set(key, value); });
  const kv = { get: vi.fn(async (key: string) => values.get(key) ?? null), put };
  return { kv, put };
}

function database(user: Record<string, unknown> | null = account) {
  const rows = new Map<unknown, any[]>([[users, user ? [user] : []]]);
  const conditions: { table: unknown; sql: string; params: unknown[] }[] = [];
  let lastInsert: Record<string, unknown> = {};
  let alreadyVoted = false;
  const db: any = {
    rows, conditions,
    select: vi.fn(() => ({
      from: (table: unknown) => {
        let condition: any;
        const result = () => {
          const query = condition ? new SQLiteSyncDialect().sqlToQuery(condition) : { sql: "", params: [] };
          conditions.push({ table, ...query });
          // Emulate the ownership predicates that are the route authorization boundary.
          return (rows.get(table) ?? []).filter((row) => {
            if (table === productRevisions) {
              if (query.sql.includes('"product_id"') && !query.params.includes(row.productId)) return false;
            }
            if (table === apiKeys && query.sql.includes('"user_id"') && !query.params.includes(row.userId)) return false;
            return true;
          });
        };
        const builder: any = {
          where: (value: any) => { condition = value; return builder; },
          innerJoin: () => builder, orderBy: () => builder,
          limit: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve),
        };
        return builder;
      },
    })),
    insert: vi.fn(() => ({
      values: (value: Record<string, unknown>) => {
        lastInsert = value;
        const builder: any = {
          onConflictDoNothing: () => builder,
          returning: async () => {
            if ("voteDate" in value) {
              if (alreadyVoted) return [];
              alreadyVoted = true;
            }
            return [{ ...value, id: "created-id" }];
          },
        };
        return builder;
      },
    })),
    update: vi.fn(() => ({ set: () => ({ where: vi.fn() }) })),
    delete: vi.fn(() => ({ where: vi.fn() })),
    // D1 batch: statements run in order inside one implicit transaction.
    batch: vi.fn(async (queries: unknown[]) => Promise.all(queries)),
    lastInsert: () => lastInsert,
  };
  return db;
}

async function request(path: string, body?: unknown, scope: "mcp:write" | "mcp:keys" = "mcp:write", method = "POST") {
  return new Request(`${ORIGIN}${path}`, {
    method, headers: { [MCP_ASSERTION_HEADER]: await sign({ path, method, scope }), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MCP_DELEGATION_SECRET", SECRET);
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  vi.stubEnv("MCP_OAUTH_RESOURCE", ISSUER);
  mocks.cloudflare.mockImplementation(() => { throw new Error("No Cloudflare context"); });
  mocks.session.mockResolvedValue(null);
  mocks.db.mockReturnValue(database());
  mocks.draft.mockResolvedValue({ id: "product-1" });
  mocks.revision.mockResolvedValue({ id: revisionId });
  mocks.earlyBird.mockResolvedValue({ isEarlyBird: true, slotNumber: 1 });
  mocks.checkout.mockResolvedValue({ url: "https://checkout.example/session" });
  mocks.submit.mockResolvedValue({ submission: { id: "submission-1" }, modCase: { id: "case-1" } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("MCP delegation assertion verification", () => {
  it("verifies a real signature and uses the current database identity", async () => {
    const db = database();
    const caller = await resolveCaller(new Headers({ [MCP_ASSERTION_HEADER]: await sign({ role: "admin", email: "forged@example.com" }) }), db, context);
    expect(caller).toEqual({ authType: "delegation", user: {
      id: account.id, name: account.name, email: account.email, role: "user", emailVerified: true, image: null,
    } });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([
    ["issuer", { iss: "https://attacker.example/mcp" }],
    ["audience", { aud: "https://attacker.example/api" }],
    ["scope", { scope: "mcp:keys" }],
    ["combined scopes", { scope: "mcp:write mcp:keys" }],
    ["path", { path: "/api/v1/admin/queue" }],
    ["method", { method: "GET" }],
    ["expired", { iat: 1, exp: 61 }],
    ["blank subject", { sub: " " }],
    ["blank nonce", { jti: "" }],
    ["noninteger issued-at", { iat: Math.floor(Date.now() / 1000) + 0.5 }],
  ])("rejects wrong %s", async (_label, claims) => {
    expect(await verifyMcpDelegation(await sign(claims), context)).toBeNull();
  });

  it("rejects overlong and future-issued assertions at the current clock", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifyMcpDelegation(await sign({ iat: now, exp: now + 61 }), context)).toBeNull();
    expect(await verifyMcpDelegation(await sign({ iat: now + 10, exp: now + 60 }), context)).toBeNull();
    expect(await verifyMcpDelegation(await sign({ iat: now + 5, exp: now + 60 }), context)).toBe(account.id);
  });

  it.each(["sub", "jti", "iat", "exp", "scope", "method", "path"])("requires %s", async (claim) => {
    expect(await verifyMcpDelegation(await sign({ [claim]: undefined }), context)).toBeNull();
  });

  it("rejects a replayed assertion (same jti) outside a Worker", async () => {
    const assertion = await sign();
    expect(await verifyMcpDelegation(assertion, context)).toBe(account.id);
    expect(await verifyMcpDelegation(assertion, context)).toBeNull();
  });

  it("records each jti in KV with the token lifetime as TTL and rejects reuse", async () => {
    const { kv, put } = fakeKv();
    mocks.cloudflare.mockReturnValue({ env: { MCP_DELEGATION_SECRET: SECRET, BETTER_AUTH_URL: ORIGIN, MCP_DELEGATION_JTI: kv } });
    const jti = crypto.randomUUID();
    const assertion = await sign({ jti });
    expect(await verifyMcpDelegation(assertion, context)).toBe(account.id);
    expect(put).toHaveBeenCalledWith(`mcp-jti:${jti}`, "1", { expirationTtl: 60 });
    expect(await verifyMcpDelegation(assertion, context)).toBeNull();
  });

  it("does not consume the jti of an assertion that fails other checks", async () => {
    const { kv, put } = fakeKv();
    mocks.cloudflare.mockReturnValue({ env: { MCP_DELEGATION_SECRET: SECRET, BETTER_AUTH_URL: ORIGIN, MCP_DELEGATION_JTI: kv } });
    expect(await verifyMcpDelegation(await sign({ path: "/api/v1/other" }), context)).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it("accepts assertions issued by a configured legacy resource only", async () => {
    const { kv } = fakeKv();
    const legacy = "https://mcp.nextlevelbuilder.io/mcp";
    mocks.cloudflare.mockReturnValue({ env: {
      MCP_DELEGATION_SECRET: SECRET, BETTER_AUTH_URL: ORIGIN, MCP_DELEGATION_JTI: kv, MCP_OAUTH_LEGACY_RESOURCES: legacy,
    } });
    expect(await verifyMcpDelegation(await sign({ iss: legacy }), context)).toBe(account.id);
    expect(await verifyMcpDelegation(await sign({ iss: "https://evil.example/mcp" }), context)).toBeNull();
  });

  it("fails closed inside a Worker when the replay KV binding is missing", async () => {
    mocks.cloudflare.mockReturnValue({ env: { MCP_DELEGATION_SECRET: SECRET, BETTER_AUTH_URL: ORIGIN } });
    expect(await verifyMcpDelegation(await sign(), context)).toBeNull();
  });

  it("rejects wrong signature, algorithm and exact type", async () => {
    expect(await verifyMcpDelegation(await sign({}, undefined, `${SECRET}-wrong`), context)).toBeNull();
    expect(await verifyMcpDelegation(await sign({}, { alg: "HS384", typ: "nlb-mcp-delegation+jwt" }), context)).toBeNull();
    expect(await verifyMcpDelegation(await sign({}, { alg: "HS256", typ: "JWT" }), context)).toBeNull();
    expect(await verifyMcpDelegation(await sign({}, { alg: "HS256", typ: "application/nlb-mcp-delegation+jwt" }), context)).toBeNull();
  });

  it.each(["", "not-a-jwt"])("never falls back when the assertion is present (%s)", async (assertion) => {
    mocks.session.mockResolvedValue({ user: account });
    const db = database();
    expect(await resolveCaller(new Headers({
      [MCP_ASSERTION_HEADER]: assertion, cookie: "session=valid", authorization: "Bearer nlb_live_valid",
    }), db, context)).toBeNull();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects delegation outside explicitly opted-in routes", async () => {
    expect(await resolveCaller(new Headers({ [MCP_ASSERTION_HEADER]: await sign() }), database())).toBeNull();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", null], ["permanently banned", { ...account, banned: true }],
    ["temporarily banned", { ...account, banned: true, banExpires: new Date(Date.now() + 60000) }],
  ])("denies a %s user", async (_label, user) => {
    expect(await resolveCaller(new Headers({ [MCP_ASSERTION_HEADER]: await sign() }), database(user), context)).toBeNull();
  });

  it("accepts an expired temporary ban", async () => {
    expect(await resolveCaller(new Headers({ [MCP_ASSERTION_HEADER]: await sign() }),
      database({ ...account, banned: true, banExpires: new Date(Date.now() - 1000) }), context)).not.toBeNull();
  });

  it("uses Cloudflare secret and canonical configured origin, never request Host", async () => {
    const cfSecret = `${SECRET}-cloudflare`;
    mocks.cloudflare.mockReturnValue({ env: { MCP_DELEGATION_SECRET: cfSecret, NEXT_PUBLIC_APP_URL: "https://staging.example/app", MCP_DELEGATION_JTI: fakeKv().kv } });
    expect(await verifyMcpDelegation(await sign({ aud: "https://staging.example/api" }, undefined, cfSecret), context)).toBe(account.id);
    expect(await resolveCaller(new Headers({ host: "attacker.example", [MCP_ASSERTION_HEADER]: await sign({ aud: "https://attacker.example/api" }, undefined, cfSecret) }), database(), context)).toBeNull();
  });

  it("rejects missing or short secrets and missing configured audience", async () => {
    const assertion = await sign();
    vi.stubEnv("MCP_DELEGATION_SECRET", "too-short");
    expect(await verifyMcpDelegation(assertion, context)).toBeNull();
    vi.stubEnv("MCP_DELEGATION_SECRET", "");
    expect(await verifyMcpDelegation(assertion, context)).toBeNull();
    vi.stubEnv("MCP_DELEGATION_SECRET", SECRET);
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(await verifyMcpDelegation(assertion, context)).toBeNull();
  });
});

describe("delegated API permissions", () => {
  const draft = { orgId: "org-1", slug: "test-product", title: "Test", tagline: "Test", websiteUrl: "https://example.com" };
  const params = { params: Promise.resolve({ slug: "test-product" }) };

  it("preserves product organization membership checks", async () => {
    const db = database();
    mocks.db.mockReturnValue(db);
    expect((await createProduct(await request("/api/v1/products", draft))).status).toBe(403);
    expect(mocks.draft).not.toHaveBeenCalled();
    db.rows.set(members, [{ userId: account.id, organizationId: draft.orgId }]);
    expect((await createProduct(await request("/api/v1/products", draft))).status).toBe(201);
    expect(db.conditions.find((query: any) => query.table === members).params).toEqual([draft.orgId, account.id]);
    expect(mocks.draft).toHaveBeenCalledWith(draft);
  });

  it("creates delegated revisions as the authenticated user", async () => {
    const db = database();
    db.rows.set(products, [{ id: "product-1", orgId: "org-1" }]);
    db.rows.set(members, [{ userId: account.id, organizationId: "org-1" }]);
    mocks.db.mockReturnValue(db);
    const document = { schemaVersion: 1, title: "Test", tagline: "Test", description: "A useful product description",
      websiteUrl: "https://example.com", categorySlugs: ["tools"], tagSlugs: [], blocks: [] };
    expect((await createRevision(await request("/api/v1/products/test-product/revisions", { document }), params)).status).toBe(201);
    expect(mocks.revision).toHaveBeenCalledWith({ productId: "product-1", createdBy: account.id, document });
  });

  it("rejects foreign organization revisions and submissions before effects", async () => {
    const db = database();
    db.rows.set(products, [{ id: "product-1", orgId: "org-other" }]);
    mocks.db.mockReturnValue(db);
    expect((await createRevision(await request("/api/v1/products/test-product/revisions", {}), params)).status).toBe(403);
    expect((await submitProduct(await request("/api/v1/products/test-product/submit", {}), params)).status).toBe(403);
    expect(mocks.revision).not.toHaveBeenCalled();
    expect(mocks.earlyBird).not.toHaveBeenCalled();
  });

  it("preserves payment requirements for delegated product submission", async () => {
    const db = database();
    db.rows.set(products, [{ id: "product-1", orgId: "org-1" }]);
    db.rows.set(members, [{ userId: account.id }]);
    mocks.db.mockReturnValue(db);
    const response = await submitProduct(await request("/api/v1/products/test-product/submit", { revisionId }), params);
    expect(response.status).toBe(402);
    expect(mocks.checkout).toHaveBeenCalledWith("early", account.email, "test-product");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("cannot submit a revision belonging to another product", async () => {
    const db = database({ ...account, role: "admin" });
    db.rows.set(products, [{ id: "product-1", orgId: "org-1" }]);
    db.rows.set(productRevisions, [{ id: revisionId, productId: "other-product" }]);
    mocks.db.mockReturnValue(db);
    expect((await submitProduct(await request("/api/v1/products/test-product/submit", { revisionId }), params)).status).toBe(404);
    expect(mocks.submit).not.toHaveBeenCalled();
    const query = db.conditions.find((entry: any) => entry.table === productRevisions);
    expect(query.sql).toContain('"product_id"');
    expect(query.params).toEqual([revisionId, "product-1"]);
    db.rows.set(productRevisions, [{ id: revisionId, productId: "product-1" }]);
    expect((await submitProduct(await request("/api/v1/products/test-product/submit", { revisionId }), params)).status).toBe(200);
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ productId: "product-1", revisionId, submitterId: account.id }));
  });

  it("preserves Turnstile, duplicate vote and rate-limit checks", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-turnstile-secret");
    const db = database();
    mocks.db.mockReturnValue(db);
    const body = { productId: revisionId };
    expect((await vote(await request("/api/v1/votes", body))).status).toBe(400);
    expect(db.batch).not.toHaveBeenCalled();
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: false }) });
    vi.stubGlobal("fetch", fetchMock);
    expect((await vote(await request("/api/v1/votes", { ...body, turnstileToken: "bad" }))).status).toBe(400);
    expect(db.batch).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ json: async () => ({ success: true }) });
    expect((await vote(await request("/api/v1/votes", { ...body, turnstileToken: "valid" }))).status).toBe(201);
    expect(db.lastInsert()).toMatchObject({ userId: account.id, turnstileVerified: true });
    const duplicate = await vote(await request("/api/v1/votes", { ...body, turnstileToken: "valid" }));
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error).toContain("already voted");
    for (let i = 0; i < 11; i++) await vote(await request("/api/v1/votes", body));
    expect((await vote(await request("/api/v1/votes", body))).status).toBe(429);
  });

  it("keeps votes and key management session-only without an assertion", async () => {
    const headers = { authorization: "Bearer nlb_live_valid" };
    for (const [handler, path, method] of [[vote, "/api/v1/votes", "POST"], [listKeys, "/api/v1/api-keys", "GET"], [createKey, "/api/v1/api-keys", "POST"]] as const) {
      expect((await handler(new Request(`${ORIGIN}${path}`, { method, headers }))).status).toBe(401);
    }
    expect((await deleteKey(new Request(`${ORIGIN}/api/v1/api-keys/key-1`, { method: "DELETE", headers }), { params: Promise.resolve({ id: "key-1" }) })).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("retains ordinary session-based votes and key creation", async () => {
    const db = database();
    mocks.db.mockReturnValue(db);
    mocks.session.mockResolvedValue({ user: { ...account, id: "session-user" } });
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect((await vote(new Request(`${ORIGIN}/api/v1/votes`, { method: "POST", body: JSON.stringify({ productId: revisionId }) }))).status).toBe(201);
    expect(db.lastInsert()).toMatchObject({ userId: "session-user" });
    expect((await createKey(new Request(`${ORIGIN}/api/v1/api-keys`, { method: "POST", body: JSON.stringify({ name: "Session key" }) }))).status).toBe(200);
    expect(db.lastInsert()).toMatchObject({ userId: "session-user", name: "Session key" });
  });

  it("does not let valid sessions override invalid assertions on any opted route", async () => {
    mocks.session.mockResolvedValue({ user: account });
    const invalidRequest = (path: string, method = "POST") => new Request(`${ORIGIN}${path}`, {
      method, headers: { [MCP_ASSERTION_HEADER]: "invalid", cookie: "session=valid", "x-api-key": "nlb_live_valid" },
    });
    for (const [handler, path, method] of [
      [createProduct, "/api/v1/products", "POST"], [vote, "/api/v1/votes", "POST"],
      [listKeys, "/api/v1/api-keys", "GET"], [createKey, "/api/v1/api-keys", "POST"],
      [upload, "/api/v1/media/upload", "POST"], [checkout, "/api/checkout", "POST"],
    ] as const) {
      expect((await handler(invalidRequest(path, method))).status).toBe(401);
    }
    expect((await createRevision(invalidRequest("/api/v1/products/test-product/revisions"), params)).status).toBe(401);
    expect((await submitProduct(invalidRequest("/api/v1/products/test-product/submit"), params)).status).toBe(401);
    expect((await deleteKey(invalidRequest("/api/v1/api-keys/key-1", "DELETE"), { params: Promise.resolve({ id: "key-1" }) })).status).toBe(401);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("requires mcp:keys and retains organization and key ownership checks", async () => {
    const db = database();
    mocks.db.mockReturnValue(db);
    expect((await createKey(await request("/api/v1/api-keys", { name: "MCP key" }))).status).toBe(401);
    expect((await createKey(await request("/api/v1/api-keys", { name: "MCP key", organizationId: "foreign" }, "mcp:keys"))).status).toBe(403);
    expect((await createKey(await request("/api/v1/api-keys", { name: "MCP key" }, "mcp:keys"))).status).toBe(200);
    expect(db.lastInsert()).toMatchObject({ userId: account.id, name: "MCP key" });
    expect(db.lastInsert().key).toMatch(/^[a-f0-9]{64}$/);
    db.rows.set(apiKeys, [{ id: "key-1", userId: "other-user" }]);
    const keyParams = { params: Promise.resolve({ id: "key-1" }) };
    expect((await deleteKey(await request("/api/v1/api-keys/key-1", undefined, "mcp:keys", "DELETE"), keyParams)).status).toBe(404);
    expect(db.delete).not.toHaveBeenCalled();
    const listed = await listKeys(await request("/api/v1/api-keys", undefined, "mcp:keys", "GET"));
    expect(listed.status).toBe(200);
    expect((await listed.json()).data).toEqual([]);
    db.rows.set(apiKeys, [{ id: "key-1", userId: account.id }]);
    expect((await deleteKey(await request("/api/v1/api-keys/key-1", undefined, "mcp:keys", "DELETE"), keyParams)).status).toBe(200);
  });

  it("rejects invalid assertions on anonymous upload and checkout endpoints", async () => {
    for (const [handler, path] of [[upload, "/api/v1/media/upload"], [checkout, "/api/checkout"]] as const) {
      const response = await handler(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { [MCP_ASSERTION_HEADER]: "" } }));
      expect(response.status).toBe(401);
    }
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("accepts valid delegation for uploads and preserves anonymous form validation", async () => {
    const delegated = new Request(`${ORIGIN}/api/v1/media/upload`, {
      method: "POST", headers: { [MCP_ASSERTION_HEADER]: await sign({ path: "/api/v1/media/upload" }) }, body: new FormData(),
    });
    expect((await upload(delegated)).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
    expect((await upload(new Request(`${ORIGIN}/api/v1/media/upload`, { method: "POST", body: new FormData() }))).status).toBe(400);
    expect(mocks.session).toHaveBeenCalledOnce();
  });

  it("binds delegated checkout email and preserves anonymous checkout", async () => {
    expect((await checkout(await request("/api/checkout", { productId: "standard" }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenLastCalledWith("standard", account.email, undefined);
    expect((await checkout(await request("/api/checkout", { productId: "standard", customerEmail: "other@example.com" }))).status).toBe(403);
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
    expect((await checkout(new Request(`${ORIGIN}/api/checkout`, { method: "POST", body: JSON.stringify({ productId: "standard", customerEmail: "guest@example.com" }) }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenLastCalledWith("standard", "guest@example.com", undefined);
  });

  it("does not authorize an admin endpoint with delegation alone", async () => {
    expect((await adminQueue(await request("/api/v1/admin/queue", undefined, "mcp:write", "GET"))).status).toBe(401);
  });
});
