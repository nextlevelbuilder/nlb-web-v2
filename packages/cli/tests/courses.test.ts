import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../src/cli.js";
import { dateFromRecordingName, nextWeekNumber, slugifyTitle, tusUpload } from "../src/api/courses-client.js";

const BASE = "https://staging.nextlevelbuilder.io";
const KEY = "nlb_live_coursestest";
const UID = "abcdefabcdefabcdefabcdefabcdefab";
const UPLOAD_URL = "https://upload.videodelivery.net/tus/abc";

const published = [
  { id: "1", slug: "nlb-weekly-40-x", title: "NLB Weekly #40: X", description: "", locale: "vi", weekNumber: 40, durationSec: 3600, priceCents: 900, currency: "usd", thumbnailUrl: null, publishedAt: "2026-10-11T00:00:00.000Z" }
];

function recording(name = "record-261107.mp4", bytes = 10) {
  const dir = mkdtempSync(join(tmpdir(), "nlb-courses-"));
  const file = join(dir, name);
  writeFileSync(file, Buffer.alloc(bytes, 1));
  return file;
}

type Route = (url: URL, init: RequestInit) => Response | undefined;

/** Answers each request with the first route that returns a response; records every call. */
function server(...routes: Route[]) {
  return vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    for (const route of routes) {
      const res = route(url, init);
      if (res) return res;
    }
    return Response.json({ error: "unexpected", code: "unexpected" }, { status: 500 });
  });
}

const on = (method: string, path: string, res: () => Response): Route => (url, init) =>
  (init.method ?? "GET") === method && url.pathname === path ? res() : undefined;

function tusRoutes(size: number): Route[] {
  return [
    (url, init) => (url.href === UPLOAD_URL && init.method === "HEAD" ? new Response(null, { status: 200, headers: { "Upload-Offset": "0" } }) : undefined),
    (url, init) => (url.href === UPLOAD_URL && init.method === "PATCH" ? new Response(null, { status: 204, headers: { "Upload-Offset": String(size) } }) : undefined)
  ];
}

async function run(args: string[], fetchFn: ReturnType<typeof server>) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const deps = { fetchFn: fetchFn as unknown as typeof fetch, sleep: async () => {} };
  await createProgram({ courses: deps }).parseAsync(["node", "nlb", "courses", ...args, "--api-key", KEY, "--url", BASE]);
  return { log, err, json: () => JSON.parse(String(log.mock.calls.at(-1)?.[0])) };
}

const calls = (fetchFn: ReturnType<typeof server>) =>
  fetchFn.mock.calls.map(([u, i]) => `${(i as RequestInit | undefined)?.method ?? "GET"} ${new URL(String(u)).pathname}`);
const bodyOf = (fetchFn: ReturnType<typeof server>, method: string, path: string) => {
  const hit = fetchFn.mock.calls.find(([u, i]) => (i as RequestInit).method === method && new URL(String(u)).pathname === path);
  return JSON.parse(String((hit![1] as RequestInit).body));
};

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("course helpers", () => {
  it("derives slug, date and next week the way existing videos are named", () => {
    expect(slugifyTitle("NLB Weekly #43: Grok bot và công ty một người")).toBe("nlb-weekly-43-grok-bot-va-cong-ty-mot-nguoi");
    expect(slugifyTitle("NLB Weekly #41: Bài học triển khai AI cho doanh nghiệp")).toBe("nlb-weekly-41-bai-hoc-trien-khai-ai-cho-doanh-nghiep");
    expect(dateFromRecordingName("G:\\records\\record-261031.mp4")).toBe("2026-10-31");
    expect(dateFromRecordingName("talk.mp4")).toBeUndefined();
    expect(nextWeekNumber([{ weekNumber: 40 }, { weekNumber: null }, { weekNumber: 12 }])).toBe(41);
  });

  it("resumes a tus upload from the server offset after a failed chunk", async () => {
    const file = recording("clip.mp4", 8);
    let patches = 0;
    const fetchFn = vi.fn(async (_u: string | URL | Request, init: RequestInit = {}) => {
      if (init.method === "HEAD") return new Response(null, { headers: { "Upload-Offset": patches === 0 ? "0" : "4" } });
      patches++;
      if (patches === 2) return new Response("boom", { status: 500 });
      const offset = Number((init.headers as Record<string, string>)["Upload-Offset"]);
      return new Response(null, { status: 204, headers: { "Upload-Offset": String(offset + 4) } });
    });
    await tusUpload(file, UPLOAD_URL, { fetchFn: fetchFn as unknown as typeof fetch, chunkBytes: 4 });
    const offsets = fetchFn.mock.calls.filter(([, i]) => i?.method === "PATCH").map(([, i]) => (i!.headers as Record<string, string>)["Upload-Offset"]);
    expect(offsets).toEqual(["0", "4", "4"]);
    for (const [, init] of fetchFn.mock.calls) expect((init!.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("nlb courses publish-recording", () => {
  const args = ["--title", "Chủ đề mới", "--speaker", "Duy Nguyễn", "--description", "Tóm tắt buổi.", "--json"];

  it("uploads, waits for Stream, registers and publishes with the house conventions", async () => {
    const file = recording();
    let polls = 0;
    const fetchFn = server(
      on("GET", "/api/courses/videos", () => Response.json({ data: published })),
      on("POST", "/api/courses/uploads", () => Response.json({ data: { streamUid: UID, uploadUrl: UPLOAD_URL } }, { status: 201 })),
      on("GET", `/api/courses/uploads/${UID}`, () =>
        Response.json({ data: { streamUid: UID, state: polls++ ? "ready" : "inprogress", pctComplete: 50, readyToStream: polls > 1, requireSignedUrls: true, durationSec: 5400, errorReason: null } })
      ),
      on("POST", "/api/courses/videos", () => Response.json({ data: {} }, { status: 201 })),
      on("POST", "/api/courses/videos/nlb-weekly-41-chu-de-moi/publish", () => Response.json({ data: { ...published[0], slug: "nlb-weekly-41-chu-de-moi" } })),
      ...tusRoutes(10)
    );
    const { json } = await run(["publish-recording", file, ...args], fetchFn);
    expect(json()).toMatchObject({ success: true, streamUid: UID });
    expect(bodyOf(fetchFn, "POST", "/api/courses/uploads")).toEqual({ name: "41 - 2026-11-07 - Duy Nguyễn - Chủ đề mới", sizeBytes: 10 });
    expect(bodyOf(fetchFn, "POST", "/api/courses/videos")).toEqual({
      slug: "nlb-weekly-41-chu-de-moi",
      title: "NLB Weekly #41: Chủ đề mới",
      description: "Tóm tắt buổi.\n\nDiễn giả: Duy Nguyễn · 2026-11-07",
      locale: "vi",
      weekNumber: 41,
      priceCents: 900,
      currency: "usd",
      thumbnailUrl: null,
      streamUid: UID,
      durationSec: 5400
    });
    expect(calls(fetchFn).at(-1)).toBe("POST /api/courses/videos/nlb-weekly-41-chu-de-moi/publish");
  });

  it("is idempotent: skips published slugs and refreshes a draft left by an earlier run", async () => {
    const already = server(on("GET", "/api/courses/videos", () => Response.json({ data: [...published, { ...published[0], slug: "nlb-weekly-41-chu-de-moi", weekNumber: 41 }] })));
    const first = await run(["publish-recording", recording(), ...args, "--week", "41"], already);
    expect(first.json()).toMatchObject({ alreadyPublished: true });
    expect(calls(already)).toEqual(["GET /api/courses/videos"]);
    vi.restoreAllMocks();

    const draft = server(
      on("GET", "/api/courses/videos", () => Response.json({ data: published })),
      on("GET", `/api/courses/uploads/${UID}`, () => Response.json({ data: { streamUid: UID, state: "ready", pctComplete: 100, readyToStream: true, requireSignedUrls: true, durationSec: 60, errorReason: null } })),
      on("POST", "/api/courses/videos", () => Response.json({ error: "taken", code: "slug_taken" }, { status: 409 })),
      on("PATCH", "/api/courses/videos/nlb-weekly-41-chu-de-moi", () => Response.json({ data: {} })),
      on("POST", "/api/courses/videos/nlb-weekly-41-chu-de-moi/publish", () => Response.json({ data: published[0] }))
    );
    await run(["publish-recording", recording(), ...args, "--stream-uid", UID], draft);
    expect(calls(draft)).not.toContain("POST /api/courses/uploads");
    expect(bodyOf(draft, "PATCH", "/api/courses/videos/nlb-weekly-41-chu-de-moi")).toMatchObject({ streamUid: UID, durationSec: 60 });
    expect(bodyOf(draft, "PATCH", "/api/courses/videos/nlb-weekly-41-chu-de-moi").slug).toBeUndefined();
  });

  it("dry run writes nothing and refuses a video that is not signed-only", async () => {
    const dry = server(on("GET", "/api/courses/videos", () => Response.json({ data: published })));
    const { json } = await run(["publish-recording", recording(), ...args, "--dry-run"], dry);
    expect(json()).toMatchObject({ dryRun: true, video: { slug: "nlb-weekly-41-chu-de-moi" } });
    expect(calls(dry)).toEqual(["GET /api/courses/videos"]);
    vi.restoreAllMocks();

    const open = server(
      on("GET", "/api/courses/videos", () => Response.json({ data: published })),
      on("GET", `/api/courses/uploads/${UID}`, () => Response.json({ data: { streamUid: UID, state: "ready", pctComplete: 100, readyToStream: true, requireSignedUrls: false, durationSec: 60, errorReason: null } }))
    );
    const res = await run(["publish-recording", recording(), ...args, "--stream-uid", UID], open);
    expect(res.json()).toMatchObject({ success: false });
    expect(res.json().error).toContain("not signed-only");
    expect(process.exitCode).toBe(1);
  });

  it("surfaces admin errors from the API", async () => {
    const fetchFn = server(on("POST", "/api/courses/videos/x/publish", () => Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 })));
    const { json } = await run(["publish", "x", "--json"], fetchFn);
    expect(json()).toMatchObject({ success: false, status: 403, code: "forbidden" });
    expect(json().error).toContain("admin account");
  });
});
