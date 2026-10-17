import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ caller: vi.fn() }));
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: mocks.caller }));

import { GET as listBlocks } from "@/app/api/v1/blog/blocks/route";
import { POST as validate } from "@/app/api/v1/blog/validate/route";
import { GET as listPosts, POST as createPostRoute } from "@/app/api/v1/blog/posts/route";
import { DELETE as archiveRoute, GET as getPostRoute, PATCH as patchRoute } from "@/app/api/v1/blog/posts/[idOrSlug]/route";
import { POST as publishRoute } from "@/app/api/v1/blog/posts/[idOrSlug]/publish/route";
import { GET as revisionsRoute } from "@/app/api/v1/blog/posts/[idOrSlug]/revisions/route";
import { GET as revisionRoute } from "@/app/api/v1/blog/posts/[idOrSlug]/revisions/[revisionId]/route";
import { POST as restoreRoute } from "@/app/api/v1/blog/posts/[idOrSlug]/revisions/[revisionId]/restore/route";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

const BASE = "https://nlb.test/api/v1/blog";
const admin = { user: { id: "blog-admin", name: "Admin", email: "admin@nlb.test", role: "admin", emailVerified: true }, authType: "api_key" };
const member = { user: { id: "blog-member", name: "Member", email: "member@nlb.test", role: "user", emailVerified: true }, authType: "api_key" };
const params = (idOrSlug: string, revisionId?: string) => ({ params: Promise.resolve({ idOrSlug, ...(revisionId ? { revisionId } : {}) }) as Promise<{ idOrSlug: string; revisionId: string }> });

function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

let slugCounter = 0;
const newPost = (overrides: Record<string, unknown> = {}) => ({
  locale: "en",
  slug: `route-post-${++slugCounter}`,
  title: "Route post",
  blocks: [{ type: "paragraph", props: { text: "Hello" } }],
  ...overrides,
});

async function create(body = newPost(), headers: Record<string, string> = {}) {
  const response = await createPostRoute(request("/posts", "POST", body, headers));
  return { response, json: await response.json() };
}

describe("blog API routes", () => {
  beforeAll(async () => {
    await getDb().insert(users).values([
      { id: admin.user.id, name: "Admin", email: admin.user.email, role: "admin" },
      { id: member.user.id, name: "Member", email: member.user.email, role: "user" },
    ]);
  });
  beforeEach(() => {
    mocks.caller.mockReset();
    mocks.caller.mockResolvedValue(admin);
  });

  it("returns 401 without a caller and 403 for non-admins on every protected route", async () => {
    const { json } = await create();
    const id = json.data.id as string;
    const protectedCalls = () => [
      createPostRoute(request("/posts", "POST", newPost())),
      patchRoute(request(`/posts/${id}`, "PATCH", { version: 1, title: "x" }), params(id)),
      publishRoute(request(`/posts/${id}/publish`, "POST", { version: 1 }), params(id)),
      archiveRoute(request(`/posts/${id}?version=1`, "DELETE"), params(id)),
      revisionsRoute(request(`/posts/${id}/revisions`), params(id)),
      listPosts(request("/posts?status=draft")),
    ];
    mocks.caller.mockResolvedValue(null);
    for (const response of await Promise.all(protectedCalls())) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    }
    mocks.caller.mockResolvedValue(member);
    for (const response of await Promise.all(protectedCalls())) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
    }
    // Delegation context is passed so signed MCP assertions are accepted.
    expect(mocks.caller).toHaveBeenCalledWith(expect.any(Headers), undefined, expect.objectContaining({ scope: "mcp:write", method: "POST", path: "/api/v1/blog/posts" }));
    expect(mocks.caller).toHaveBeenCalledWith(expect.any(Headers), undefined, expect.objectContaining({ scope: "mcp:read", method: "GET", path: `/api/v1/blog/posts/${id}/revisions` }));
  });

  it("runs the create → stale update → publish → public read flow", async () => {
    const { response, json } = await create(newPost({ slug: "flow-post" }));
    expect(response.status).toBe(201);
    expect(json.data).toMatchObject({ status: "draft", version: 1, description: null });
    const id = json.data.id as string;

    mocks.caller.mockResolvedValue(null);
    expect((await getPostRoute(request("/posts/flow-post?locale=en"), params("flow-post"))).status).toBe(404);
    expect((await listPosts(request("/posts?locale=en"))).status).toBe(200);
    mocks.caller.mockResolvedValue(admin);
    expect((await getPostRoute(request(`/posts/${id}`), params(id))).status).toBe(200);

    const patched = await patchRoute(request(`/posts/${id}`, "PATCH", { version: 1, title: "Flow v2" }), params(id));
    expect((await patched.json()).data.version).toBe(2);
    const stale = await patchRoute(request(`/posts/${id}`, "PATCH", { version: 1, title: "Stale" }), params(id));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ currentVersion: 2 });

    const published = await publishRoute(request(`/posts/${id}/publish`, "POST", { version: 2 }), params(id));
    expect((await published.json()).data).toMatchObject({ status: "published", version: 3 });

    mocks.caller.mockResolvedValue(null);
    const publicGet = await getPostRoute(request("/posts/flow-post?locale=en"), params("flow-post"));
    expect((await publicGet.json()).data.title).toBe("Flow v2");
    const list = await (await listPosts(request("/posts?locale=en&limit=5"))).json();
    expect(list.pagination).toMatchObject({ limit: 5, offset: 0 });
    expect(list.data.find((post: { id: string }) => post.id === id)).not.toHaveProperty("blocks");
    expect((await listPosts(request("/posts?limit=500"))).status).toBe(400);

    mocks.caller.mockResolvedValue(admin);
    const archived = await archiveRoute(request(`/posts/${id}?version=3`, "DELETE"), params(id));
    expect((await archived.json()).data.status).toBe("archived");
    expect((await archiveRoute(request(`/posts/${id}`, "DELETE"), params(id))).status).toBe(400);
  });

  it("lists revisions and restores one through the API", async () => {
    const { json } = await create();
    const id = json.data.id as string;
    await patchRoute(request(`/posts/${id}`, "PATCH", { version: 1, title: "Changed" }), params(id));
    const revisions = (await (await revisionsRoute(request(`/posts/${id}/revisions`), params(id))).json()).data;
    expect(revisions.map((r: { version: number }) => r.version)).toEqual([2, 1]);
    const first = (await (await revisionRoute(request(`/posts/${id}/revisions/${revisions[1].id}`), params(id, revisions[1].id))).json()).data;
    expect(first.snapshot.title).toBe("Route post");
    const restored = await restoreRoute(request(`/posts/${id}/revisions/${first.id}/restore`, "POST", { version: 2 }), params(id, first.id));
    expect((await restored.json()).data).toMatchObject({ title: "Route post", version: 3, status: "draft" });
  });

  it("replays idempotent writes and rejects a reused key with a different body", async () => {
    const body = newPost();
    const first = await create(body, { "Idempotency-Key": "create-abc" });
    const replay = await create(body, { "Idempotency-Key": "create-abc" });
    expect(replay.response.status).toBe(201);
    expect(replay.response.headers.get("idempotency-replayed")).toBe("true");
    expect(replay.json.data.id).toBe(first.json.data.id);

    const different = await create({ ...body, title: "Different" }, { "Idempotency-Key": "create-abc" });
    expect(different.response.status).toBe(422);
    expect((await create(newPost(), { "Idempotency-Key": "x".repeat(129) })).response.status).toBe(400);
  });

  it("maps validation, size and JSON errors to the contract envelope", async () => {
    const invalid = await create(newPost({ blocks: [{ type: "heading", props: {} }] }));
    expect(invalid.response.status).toBe(400);
    expect(invalid.json).toMatchObject({ error: "Validation failed", details: [{ path: "blocks.0.props.text", message: expect.any(String) }] });

    const big = Array.from({ length: 55 }, () => ({ type: "paragraph", props: { text: "y".repeat(3900) } }));
    expect((await create(newPost({ blocks: big }))).response.status).toBe(413);
    expect((await createPostRoute(request("/posts", "POST", "{not json"))).status).toBe(400);
    expect((await create(newPost({ slug: "dup-slug" }))).response.status).toBe(201);
    expect((await create(newPost({ slug: "dup-slug" }))).response.status).toBe(409);
  });

  it("serves the public block catalogue and validation endpoint", async () => {
    mocks.caller.mockResolvedValue(null);
    const catalogue = (await listBlocks().json()).data;
    expect(catalogue.length).toBeGreaterThan(10);
    expect(catalogue[0]).toEqual(expect.objectContaining({ type: expect.any(String), propsSchema: expect.any(Object), example: expect.any(Object) }));

    const ok = await (await validate(request("/validate", "POST", { blocks: [{ type: "paragraph", props: { text: "x" } }] }))).json();
    expect(ok.data).toEqual({ valid: true, errors: [] });
    const bad = await (await validate(request("/validate", "POST", { blocks: [{ type: "nope", props: {} }] }))).json();
    expect(bad.data.valid).toBe(false);
    expect(bad.data.errors[0].path).toBe("blocks.0.type");
    expect((await validate(request("/validate", "POST", "[]"))).status).toBe(400);
  });
});
