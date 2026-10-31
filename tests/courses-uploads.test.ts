import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCaller } from "@/lib/auth-api-key";
import { createStreamUploadClient } from "@/lib/courses/stream-video-api";

const resolveCallerMock = vi.fn<(headers: Headers, db?: unknown, delegation?: unknown) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({
  resolveCaller: (headers: Headers, db?: unknown, delegation?: unknown) => resolveCallerMock(headers, db, delegation),
}));

const ACCOUNT = "7ac87c90789159ae1b10b7d78f5dcc08";
const UID = "abcdefabcdefabcdefabcdefabcdefab";
const config = { accountId: ACCOUNT, apiToken: "test-token" };
const admin: ResolvedCaller = { user: { id: "admin-1", name: "A", email: "a@example.com", role: "admin", emailVerified: true }, authType: "api_key" };
const member: ResolvedCaller = { user: { id: "user-1", name: "U", email: "u@example.com", role: "user", emailVerified: true }, authType: "session" };

describe("Stream direct uploads", () => {
  it("reserves a signed-only tus upload and returns its one-time URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 201,
      headers: { Location: "https://upload.videodelivery.net/tus/abc", "stream-media-id": UID },
    }));
    const upload = await createStreamUploadClient(config, fetcher).createUpload({ name: "41 - Cường Võ", sizeBytes: 1024 });
    expect(upload).toEqual({ streamUid: UID, uploadUrl: "https://upload.videodelivery.net/tus/abc" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream?direct_user=true`);
    const headers = new Headers(init?.headers);
    expect(headers.get("upload-length")).toBe("1024");
    const metadata = Object.fromEntries(headers.get("upload-metadata")!.split(",").map((pair) => pair.split(" ")));
    expect(Buffer.from(metadata.name, "base64").toString("utf8")).toBe("41 - Cường Võ");
    expect(metadata).toHaveProperty("requiresignedurls");
    expect(Buffer.from(metadata.maxdurationseconds, "base64").toString()).toBe("21600");
  });

  it("fails with 502 when Stream does not hand back an upload URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 400 }));
    await expect(createStreamUploadClient(config, fetcher).createUpload({ name: "x", sizeBytes: 1 })).rejects.toMatchObject({ status: 502 });
  });

  it("reads processing status and duration", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      success: true,
      result: { uid: UID, readyToStream: true, requireSignedURLs: true, duration: 8055.85, status: { state: "ready", pctComplete: "100.000000" } },
    }));
    expect(await createStreamUploadClient(config, fetcher).getStatus(UID)).toEqual({
      streamUid: UID, state: "ready", pctComplete: 100, readyToStream: true, requireSignedUrls: true, durationSec: 8056, errorReason: null,
    });
    const unknown = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(createStreamUploadClient(config, unknown).getStatus(UID)).rejects.toMatchObject({ status: 422 });
  });
});

describe("admin upload routes", () => {
  beforeEach(() => resolveCallerMock.mockReset());

  it("requires an admin and accepts an mcp:write delegation for the exact request", async () => {
    const { POST } = await import("@/app/api/courses/uploads/route");
    const request = () => new Request("https://nlb.test/api/courses/uploads", { method: "POST", body: JSON.stringify({ name: "x", sizeBytes: 1 }) });
    resolveCallerMock.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    resolveCallerMock.mockResolvedValue(member);
    expect((await POST(request())).status).toBe(403);
    expect(resolveCallerMock.mock.calls[0][2]).toEqual({ scope: "mcp:write", method: "POST", path: "/api/courses/uploads" });
  });

  it("validates the body before touching Stream", async () => {
    const { POST } = await import("@/app/api/courses/uploads/route");
    resolveCallerMock.mockResolvedValue(admin);
    const response = await POST(new Request("https://nlb.test/api/courses/uploads", { method: "POST", body: JSON.stringify({ name: "x", sizeBytes: 0 }) }));
    expect(response.status).toBe(400);
  });

  it("answers 404 for a malformed uid", async () => {
    const { GET } = await import("@/app/api/courses/uploads/[uid]/route");
    resolveCallerMock.mockResolvedValue(admin);
    const response = await GET(new Request("https://nlb.test/api/courses/uploads/x"), { params: Promise.resolve({ uid: "../keys" }) });
    expect(response.status).toBe(404);
  });
});
