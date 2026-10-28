import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));
const getDb = vi.fn();
vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

import { API_KEY_SCOPES, createApiKeyForUser, hashApiKey, parseApiKeyScopes, resolveCaller } from "@/lib/auth-api-key";
import { openApiSpec } from "@/lib/openapi";
import { requireIngester, requireRenderer } from "@/lib/builder-league/admin-key-auth";
import { BuilderApiError } from "@/lib/builder-league/http";
import { POST as createKey } from "@/app/api/v1/api-keys/route";
import type { AppDb } from "@/lib/db";

const RAW_KEY = "nlb_live_0123456789abcdef0123456789abcdef0123456789abcdef";
const ADMIN = { id: "admin-1", name: "Admin", email: "admin@nlb.test", role: "admin", image: null, emailVerified: true };
const MEMBER = { ...ADMIN, id: "member-1", role: "user" };

/** A db whose first `limit()` returns the key row and the second the key's owner, like `verifyApiKey`. */
function keyDb(permissions: string | null, owner = ADMIN): AppDb {
  const rows = [[{ id: "key-1", userId: owner.id, organizationId: null, key: hashApiKey(RAW_KEY), enabled: true, expiresAt: null, permissions }], [owner]];
  let call = 0;
  const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve(rows[call++] ?? []) };
  return { select: () => chain } as unknown as AppDb;
}

function keyRequest(path = "/api/v1/builder-admin/render-jobs/claim"): Request {
  return new Request(`https://nlb.test${path}`, { method: "POST", headers: { authorization: `Bearer ${RAW_KEY}` } });
}

async function rejection(promise: Promise<unknown>): Promise<BuilderApiError> {
  const error = await promise.then(() => null, (err: unknown) => err);
  expect(error).toBeInstanceOf(BuilderApiError);
  return error as BuilderApiError;
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  getDb.mockReset();
});

describe("scoped automation keys on Builder League machine routes", () => {
  it("accepts an admin key carrying builder:render on the renderer routes", async () => {
    await expect(requireRenderer(keyRequest(), keyDb('["builder:render"]'))).resolves.toBe("admin-1");
  });

  it("accepts an admin key carrying builder:ingest on Discord ingest", async () => {
    const request = keyRequest("/api/v1/builder-admin/ingest/discord");
    await expect(requireIngester(request, keyDb('["builder:ingest"]'))).resolves.toBe("admin-1");
  });

  it("rejects a full admin API key with 403", async () => {
    const render = await rejection(requireRenderer(keyRequest(), keyDb(null)));
    expect([render.status, render.code]).toEqual([403, "scope_required"]);
    const ingest = await rejection(requireIngester(keyRequest("/api/v1/builder-admin/ingest/discord"), keyDb(null)));
    expect([ingest.status, ingest.code]).toEqual([403, "scope_required"]);
  });

  it("rejects a key with the other scope as unauthenticated", async () => {
    const render = await rejection(requireRenderer(keyRequest(), keyDb('["builder:ingest"]')));
    expect(render.status).toBe(401);
    const ingest = await rejection(requireIngester(keyRequest("/api/v1/builder-admin/ingest/discord"), keyDb('["builder:render"]')));
    expect(ingest.status).toBe(401);
  });

  it("rejects a scoped key whose owner is not an admin", async () => {
    const error = await rejection(requireRenderer(keyRequest(), keyDb('["builder:render"]', MEMBER)));
    expect([error.status, error.code]).toEqual([403, "admin_required"]);
  });

  it("keeps admin sessions working and refuses member sessions", async () => {
    getSession.mockResolvedValueOnce({ user: ADMIN, session: { id: "s1" } });
    await expect(requireRenderer(new Request("https://nlb.test/api/v1/builder-admin/render-jobs"), keyDb(null))).resolves.toBe("admin-1");
    getSession.mockResolvedValueOnce({ user: ADMIN, session: { id: "s1" } });
    await expect(requireIngester(new Request("https://nlb.test/api/v1/builder-admin/ingest/discord"), keyDb(null))).resolves.toBe("admin-1");
    getSession.mockResolvedValueOnce({ user: MEMBER, session: { id: "s2" } });
    const error = await rejection(requireRenderer(new Request("https://nlb.test/api/v1/builder-admin/render-jobs"), keyDb(null)));
    expect(error.status).toBe(403);
  });

  it("returns 401 without any credential", async () => {
    const error = await rejection(requireRenderer(new Request("https://nlb.test/api/v1/builder-admin/render-jobs"), keyDb(null)));
    expect(error.status).toBe(401);
  });
});

describe("scoped keys elsewhere", () => {
  it("never authenticate on routes that do not ask for their scope", async () => {
    await expect(resolveCaller(keyRequest().headers, keyDb('["builder:render"]'))).resolves.toBeNull();
    const full = await resolveCaller(keyRequest().headers, keyDb(null));
    expect(full).toMatchObject({ authType: "api_key", apiKeyScopes: null });
  });

  it("parses stored scopes, keeps legacy rows full and fails closed on junk", () => {
    expect(parseApiKeyScopes(null)).toBeNull();
    expect(parseApiKeyScopes("")).toBeNull();
    expect(parseApiKeyScopes('{"products":["read"]}')).toBeNull();
    expect(parseApiKeyScopes('["builder:render","builder:ingest"]')).toEqual(["builder:render", "builder:ingest"]);
    expect(parseApiKeyScopes('["builder:render","admin:all"]')).toEqual([]);
    expect(parseApiKeyScopes("not json")).toEqual([]);
    expect(parseApiKeyScopes("42")).toEqual([]);
    expect(parseApiKeyScopes("[]")).toEqual([]);
  });
});

describe("minting scoped keys", () => {
  function insertDb() {
    const values = vi.fn((row: Record<string, unknown>) => ({ returning: () => Promise.resolve([{ ...row }]) }));
    return { db: { insert: () => ({ values }) } as unknown as AppDb, values };
  }

  it("stores scopes as a JSON array and full keys with no permissions", async () => {
    const scoped = insertDb();
    const created = await createApiKeyForUser({ userId: "admin-1", name: "render", scopes: ["builder:render", "builder:render"] }, scoped.db);
    expect(scoped.values.mock.calls[0][0]).toMatchObject({ permissions: '["builder:render"]' });
    expect(created.scopes).toEqual(["builder:render"]);
    const full = insertDb();
    expect((await createApiKeyForUser({ userId: "u", name: "cli" }, full.db)).scopes).toBeNull();
    expect(full.values.mock.calls[0][0]).toMatchObject({ permissions: null });
  });

  function mintRequest(body: unknown): Request {
    return new Request("https://nlb.test/api/v1/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  it("lets an admin session mint a scoped key and returns its scopes once", async () => {
    const { db } = insertDb();
    getDb.mockReturnValue(db);
    getSession.mockResolvedValueOnce({ user: ADMIN, session: { id: "s1" } });
    const response = await createKey(mintRequest({ name: "render worker", scopes: ["builder:render"], expiresDays: 90 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ scopes: ["builder:render"] });
    expect(body.data.key).toMatch(/^nlb_live_/);
  });

  it("refuses scoped keys for non-admins and unknown scopes", async () => {
    getDb.mockReturnValue(insertDb().db);
    getSession.mockResolvedValueOnce({ user: MEMBER, session: { id: "s2" } });
    expect((await createKey(mintRequest({ name: "x", scopes: ["builder:render"] }))).status).toBe(403);
    getSession.mockResolvedValueOnce({ user: ADMIN, session: { id: "s1" } });
    expect((await createKey(mintRequest({ name: "x", scopes: ["admin:all"] }))).status).toBe(400);
  });
});

describe("OpenAPI contract for scoped keys", () => {
  type Operation = { description?: string; "x-nlb-api-key-scope"?: string; requestBody?: { content: Record<string, { schema: { properties: Record<string, { items?: { enum?: string[] } }> } }> } };
  const paths = openApiSpec.paths as unknown as Record<string, Record<string, Operation>>;

  it("documents the required scope on every renderer and ingest operation", () => {
    const render = ["/api/v1/builder-admin/render-jobs", "/api/v1/builder-admin/render-jobs/claim", "/api/v1/builder-admin/render-jobs/{id}/complete", "/api/v1/builder-admin/render-jobs/{id}/fail"];
    for (const path of render) {
      for (const operation of Object.values(paths[path])) {
        expect(operation["x-nlb-api-key-scope"], path).toBe("builder:render");
        expect(operation.description, path).toContain("`builder:render` scope");
      }
    }
    const ingest = paths["/api/v1/builder-admin/ingest/discord"].post;
    expect(ingest["x-nlb-api-key-scope"]).toBe("builder:ingest");
    expect(ingest.description).toContain("`builder:ingest` scope");
  });

  it("lists exactly the mintable scopes on POST /api/v1/api-keys", () => {
    const body = paths["/api/v1/api-keys"].post.requestBody!.content["application/json"].schema;
    expect(body.properties.scopes.items?.enum).toEqual([...API_KEY_SCOPES]);
  });
});
