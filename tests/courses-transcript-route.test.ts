import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { courseVideos, entitlements, users } from "@/lib/db/schema";
import type { ResolvedCaller } from "@/lib/auth-api-key";
import { pageTranscript, searchTranscript } from "@/lib/courses/course-transcript-service";
import { foldText } from "@/lib/courses/course-catalogue";

const resolveCallerMock = vi.fn<(headers: Headers, db?: unknown, delegation?: unknown) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({
  resolveCaller: (headers: Headers, db?: unknown, delegation?: unknown) => resolveCallerMock(headers, db, delegation),
}));

const { GET: readTranscript, PUT: saveTranscript } = await import("@/app/api/courses/videos/[slug]/transcript/route");
const { GET: listVideos } = await import("@/app/api/courses/videos/route");

const TRANSCRIPT = "# NLB Weekly #41\n\n[00:00:05] Xin chào mọi người.\n\n[00:10:12] Hôm nay nói về công ty một người.\n\n[01:02:03] Cảm ơn.\n";
let seq = 0;

function caller(id: string, role: "user" | "admin" = "user"): ResolvedCaller {
  return { user: { id, name: id, email: `${id}@example.com`, role, emailVerified: true }, authType: "delegation" };
}

async function seedUser(role: "user" | "admin" = "user") {
  seq += 1;
  const id = `transcript-user-${seq}`;
  await getDb().insert(users).values({ id, name: id, email: `${id}@example.com`, role });
  return caller(id, role);
}

async function seedVideo(status: "draft" | "published" = "published") {
  seq += 1;
  const [video] = await getDb()
    .insert(courseVideos)
    .values({ slug: `transcript-video-${seq}`, title: "NLB Weekly #41", priceCents: 900, status, polarProductId: `polar-transcript-${seq}`, publishedAt: new Date() })
    .returning();
  return video;
}

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const get = (slug: string, qs = "") => readTranscript(new Request(`https://nlb.test/api/courses/videos/${slug}/transcript${qs}`), ctx(slug));
const put = (slug: string, body: unknown) =>
  saveTranscript(new Request(`https://nlb.test/api/courses/videos/${slug}/transcript`, { method: "PUT", body: JSON.stringify(body) }), ctx(slug));

beforeEach(() => {
  resolveCallerMock.mockReset();
  vi.stubEnv("COURSES_ACCESS_PLANS", "");
});

describe("course transcripts", () => {
  it("lets an admin store a transcript and flags it in the catalogue", async () => {
    const admin = await seedUser("admin");
    const video = await seedVideo();
    resolveCallerMock.mockResolvedValue(admin);
    const saved = await put(video.slug, { content: TRANSCRIPT, source: "gemini" });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({ slug: video.slug, source: "gemini", totalChars: TRANSCRIPT.trim().length });
    // A second PUT replaces it.
    expect((await put(video.slug, { content: "[00:00:00] Mới" })).status).toBe(200);

    const list = (await (await listVideos()).json()).data as Array<{ slug: string; hasTranscript: boolean }>;
    expect(list.find((v) => v.slug === video.slug)?.hasTranscript).toBe(true);
  });

  it("refuses non-admin writes", async () => {
    const video = await seedVideo();
    resolveCallerMock.mockResolvedValue(await seedUser());
    expect((await put(video.slug, { content: "x" })).status).toBe(403);
  });

  it("reads only for members with access, accepting an MCP read delegation", async () => {
    const admin = await seedUser("admin");
    const video = await seedVideo();
    resolveCallerMock.mockResolvedValue(admin);
    await put(video.slug, { content: TRANSCRIPT });

    resolveCallerMock.mockResolvedValue(null);
    expect((await get(video.slug)).status).toBe(401);

    const member = await seedUser();
    resolveCallerMock.mockResolvedValue(member);
    const refused = await get(video.slug);
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("purchase_required");

    await getDb().insert(entitlements).values({ userId: member.user.id, featureKey: `video:${video.id}` });
    const ok = await get(video.slug);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toContain("no-store");
    expect((await ok.json()).data).toMatchObject({ slug: video.slug, offset: 0, nextOffset: null, content: TRANSCRIPT.trim() });
    const delegation = resolveCallerMock.mock.calls.at(-1)?.[2];
    expect(delegation).toEqual({ scope: "mcp:read", method: "GET", path: `/api/courses/videos/${video.slug}/transcript` });

    const search = (await (await get(video.slug, "?q=cong%20ty")).json()).data;
    expect(search.matches).toEqual([{ offset: expect.any(Number), text: "[00:10:12] Hôm nay nói về công ty một người." }]);
  });

  it("answers 404 for drafts and for videos without a transcript", async () => {
    const admin = await seedUser("admin");
    resolveCallerMock.mockResolvedValue(admin);
    const draft = await seedVideo("draft");
    expect((await get(draft.slug)).status).toBe(404);
    const bare = await seedVideo();
    const res = await get(bare.slug);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("transcript_not_found");
  });
});

describe("transcript paging", () => {
  it("ends pages on paragraph breaks and chains nextOffset to the end", () => {
    const text = Array.from({ length: 20 }, (_, i) => `[00:0${i % 10}:00] ${"lời ".repeat(20)}${i}`).join("\n\n");
    let offset = 0;
    let joined = "";
    for (let guard = 0; guard < 50; guard++) {
      const page = pageTranscript(text, offset, 300);
      if (page.nextOffset !== null) expect(page.content.endsWith("\n\n")).toBe(true);
      joined += page.content;
      if (page.nextOffset === null) break;
      offset = page.nextOffset;
    }
    expect(joined).toBe(text);
  });

  it("matches without case or diacritics and reports offsets", () => {
    expect(foldText("Đường Công Ty")).toBe("duong cong ty");
    const [match] = searchTranscript(TRANSCRIPT, "CÔNG TY");
    expect(TRANSCRIPT.slice(match.offset, match.offset + 10)).toBe("[00:10:12]");
  });
});
