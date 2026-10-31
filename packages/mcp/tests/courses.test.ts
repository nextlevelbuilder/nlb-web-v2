import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateReadTool, requiredToolScope } from "../src/tool-context.js";
import { callTool as callOverHttp, modernRequest, rpc } from "./helpers.js";

const ENV = { NLB_API_KEY: "nlb_live_server", NLB_API_URL: "https://staging.nextlevelbuilder.io" };
const WORKER_ENV = { ...ENV, WORKER_AUTH_TOKEN: "worker-test" };
const AUTHED = { Authorization: "Bearer worker-test" };
const UID = "abcdefabcdefabcdefabcdefabcdefab";

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }));
}

function call(fetchFn: ReturnType<typeof mockFetch>, index = 0) {
  const [url, init] = fetchFn.mock.calls[index] as unknown as [string, RequestInit];
  return { url: new URL(url), init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

function callTool(name: string, args: Record<string, unknown>, headers: Record<string, string> = AUTHED) {
  return callOverHttp(name, args, WORKER_ENV, headers);
}

afterEach(() => vi.unstubAllGlobals());

describe("MCP course tools", () => {
  it("registers the course tools with admin tools on mcp:write", async () => {
    const { body } = await rpc(modernRequest("tools/list"));
    const names = (body.result!.tools as Array<{ name: string }>).map((t) => t.name);
    for (const name of ["course_list_videos", "course_create_upload", "course_get_upload", "course_create_video", "course_update_video", "course_publish_video"]) {
      expect(names).toContain(name);
    }
    expect(requiredToolScope("course_list_videos")).toBe("mcp:read");
    expect(requiredToolScope("course_create_upload")).toBe("mcp:write");
    expect(requiredToolScope("course_get_upload")).toBe("mcp:write");
    expect(requiredToolScope("course_publish_video")).toBe("mcp:write");
  });

  it("lists published videos without sending the server's API key", async () => {
    const fetchFn = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchFn);
    await callTool("course_list_videos", {});
    const c = call(fetchFn);
    expect(c.url.toString()).toBe("https://staging.nextlevelbuilder.io/api/courses/videos");
    expect(c.headers.Authorization).toBeUndefined();
  });

  it("maps the publishing steps onto the admin routes with the configured key", async () => {
    const fetchFn = mockFetch({ data: {} });
    vi.stubGlobal("fetch", fetchFn);
    await callTool("course_create_upload", { name: "41 - 2026-10-17 - Cường Võ", size_bytes: 1024 });
    await callTool("course_get_upload", { stream_uid: UID });
    await callTool("course_create_video", { video: { slug: "nlb-weekly-41-x", title: "NLB Weekly #41: X", priceCents: 900, streamUid: UID } });
    await callTool("course_update_video", { slug: "nlb-weekly-41-x", changes: { title: "Y" } });
    await callTool("course_publish_video", { slug: "nlb-weekly-41-x" });
    const calls = [0, 1, 2, 3, 4].map((i) => call(fetchFn, i));
    expect(calls.map((c) => `${c.init.method} ${c.url.pathname}`)).toEqual([
      "POST /api/courses/uploads",
      `GET /api/courses/uploads/${UID}`,
      "POST /api/courses/videos",
      "PATCH /api/courses/videos/nlb-weekly-41-x",
      "POST /api/courses/videos/nlb-weekly-41-x/publish"
    ]);
    expect(calls[0].body).toEqual({ name: "41 - 2026-10-17 - Cường Võ", sizeBytes: 1024 });
    expect(calls[2].body).toMatchObject({ slug: "nlb-weekly-41-x", priceCents: 900 });
    expect(calls[3].body).toEqual({ title: "Y" });
    for (const c of calls) expect(c.headers.Authorization).toBe("Bearer nlb_live_server");
  });

  it("rejects bad arguments before fetching and surfaces API error codes", async () => {
    const fetchFn = mockFetch({ error: "A video with this slug already exists", code: "slug_taken" }, 409);
    vi.stubGlobal("fetch", fetchFn);
    expect((await callTool("course_get_upload", { stream_uid: "../keys" })).isError).toBe(true);
    expect((await callTool("course_publish_video", { slug: "Bad Slug" })).isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const { isError, payload } = await callTool("course_create_video", { video: { slug: "taken", title: "T", priceCents: 900 } });
    expect(isError).toBe(true);
    expect(JSON.stringify(payload)).toContain("slug_taken");
  });

  it("reads a transcript page or search as a member read and writes it as an admin", async () => {
    expect(requiredToolScope("course_get_transcript")).toBe("mcp:read");
    expect(isPrivateReadTool("course_get_transcript")).toBe(true);
    expect(requiredToolScope("course_set_transcript")).toBe("mcp:write");
    const fetchFn = mockFetch({ data: {} });
    vi.stubGlobal("fetch", fetchFn);
    await callTool("course_get_transcript", { slug: "nlb-weekly-41-x" });
    await callTool("course_get_transcript", { slug: "nlb-weekly-41-x", offset: 20000, max_chars: 5000 });
    await callTool("course_get_transcript", { slug: "nlb-weekly-41-x", query: "công ty" });
    await callTool("course_set_transcript", { slug: "nlb-weekly-41-x", content: "[00:00:01] Xin chào", source: "gemini" });
    const calls = [0, 1, 2, 3].map((i) => call(fetchFn, i));
    expect(calls.map((c) => `${c.init.method} ${c.url.pathname}${c.url.search}`)).toEqual([
      "GET /api/courses/videos/nlb-weekly-41-x/transcript",
      "GET /api/courses/videos/nlb-weekly-41-x/transcript?offset=20000&limit=5000",
      `GET /api/courses/videos/nlb-weekly-41-x/transcript?q=${encodeURIComponent("công ty").replace(/%20/g, "+")}`,
      "PUT /api/courses/videos/nlb-weekly-41-x/transcript"
    ]);
    expect(calls[3].body).toEqual({ content: "[00:00:01] Xin chào", source: "gemini" });
  });

  it("explains who may read transcripts when the API refuses", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Buy this video", code: "purchase_required" }, 403));
    const { isError, payload } = await callTool("course_get_transcript", { slug: "nlb-weekly-41-x" });
    expect(isError).toBe(true);
    expect(JSON.stringify(payload)).toContain("Premium/VIP");
  });

  it("refuses anonymous HTTP callers for admin tools and transcripts", async () => {
    const fetchFn = mockFetch({ data: {} });
    vi.stubGlobal("fetch", fetchFn);
    const result = await callTool("course_create_upload", { name: "x", size_bytes: 1 }, {});
    expect(result.isError || result.status === 401).toBe(true);
    const transcript = await callTool("course_get_transcript", { slug: "nlb-weekly-41-x" }, {});
    expect(transcript.isError || transcript.status === 401).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
