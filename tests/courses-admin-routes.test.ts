import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCaller } from "@/lib/auth-api-key";

const resolveCallerMock = vi.fn<(headers: Headers) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: (headers: Headers) => resolveCallerMock(headers) }));

const { POST: createRoute, GET: listRoute } = await import("@/app/api/courses/videos/route");
const { PATCH: patchRoute } = await import("@/app/api/courses/videos/[slug]/route");

const admin: ResolvedCaller = { user: { id: "admin-1", name: "A", email: "a@example.com", role: "admin", emailVerified: true }, authType: "api_key" };
const member: ResolvedCaller = { user: { id: "user-1", name: "U", email: "u@example.com", role: "user", emailVerified: true }, authType: "session" };

function jsonRequest(body: unknown, method = "POST") {
  return new Request("https://nlb.test/api/courses/videos", { method, body: JSON.stringify(body) });
}

const validVideo = { slug: "intro-to-agents", title: "Intro to agents", priceCents: 1900 };

describe("admin course video routes", () => {
  beforeEach(() => resolveCallerMock.mockReset());

  it("rejects anonymous (401) and non-admin (403) creators", async () => {
    resolveCallerMock.mockResolvedValue(null);
    expect((await createRoute(jsonRequest(validVideo))).status).toBe(401);
    resolveCallerMock.mockResolvedValue(member);
    expect((await createRoute(jsonRequest(validVideo))).status).toBe(403);
  });

  it("validates input with zod (400) and rejects duplicate slugs (409)", async () => {
    resolveCallerMock.mockResolvedValue(admin);
    expect((await createRoute(jsonRequest({ ...validVideo, slug: "Bad Slug" }))).status).toBe(400);
    expect((await createRoute(jsonRequest({ ...validVideo, priceCents: 10 }))).status).toBe(400);

    const created = await createRoute(jsonRequest(validVideo));
    expect(created.status).toBe(201);
    expect((await created.json()).data).toMatchObject({ slug: "intro-to-agents", status: "draft" });
    expect((await createRoute(jsonRequest(validVideo))).status).toBe(409);
  });

  it("keeps drafts out of the public list and patches only allowed fields", async () => {
    resolveCallerMock.mockResolvedValue(admin);
    await createRoute(jsonRequest({ ...validVideo, slug: "draft-only" }));
    const list = await (await listRoute()).json();
    expect(list.data.map((v: { slug: string }) => v.slug)).not.toContain("draft-only");

    const ctx = { params: Promise.resolve({ slug: "draft-only" }) };
    expect((await patchRoute(jsonRequest({ status: "published" }, "PATCH"), ctx)).status).toBe(400);
    const patched = await patchRoute(jsonRequest({ title: "Renamed", status: "archived" }, "PATCH"), ctx);
    expect(patched.status).toBe(200);
    expect((await patched.json()).data).toMatchObject({ title: "Renamed", status: "archived" });
  });
});
