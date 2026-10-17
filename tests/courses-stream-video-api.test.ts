import { describe, expect, it, vi } from "vitest";
import { createStreamVideoClient, loadStreamVideoApiConfig } from "@/lib/courses/stream-video-api";

const ACCOUNT = "7ac87c90789159ae1b10b7d78f5dcc08";
const UID = "abcdefabcdefabcdefabcdefabcdefab";
const config = { accountId: ACCOUNT, apiToken: "test-token" };

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("Stream signed-only enforcement", () => {
  it("posts requireSignedURLs=true for the uid and accepts Stream's confirmation", async () => {
    const fetcher = respond(200, { success: true, result: { uid: UID, requireSignedURLs: true } });
    await createStreamVideoClient(config, fetcher).requireSignedUrls(UID);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream/${UID}`);
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({ uid: UID, requireSignedURLs: true });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
  });

  it("fails when Stream does not confirm signed-only playback", async () => {
    const fetcher = respond(200, { success: true, result: { uid: UID, requireSignedURLs: false } });
    await expect(createStreamVideoClient(config, fetcher).requireSignedUrls(UID)).rejects.toMatchObject({ status: 502, code: "stream_not_signed_only" });
  });

  it("maps an unknown uid to 422 and API or network failures to 502", async () => {
    await expect(createStreamVideoClient(config, respond(404, { success: false })).requireSignedUrls(UID)).rejects.toMatchObject({ status: 422 });
    await expect(createStreamVideoClient(config, respond(403, { success: false, errors: [{ code: 10000 }] })).requireSignedUrls(UID)).rejects.toMatchObject({ status: 502 });
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(createStreamVideoClient(config, offline).requireSignedUrls(UID)).rejects.toMatchObject({ status: 502, code: "stream_unavailable" });
  });

  it("rejects a malformed uid before calling Stream", async () => {
    const fetcher = respond(200, {});
    await expect(createStreamVideoClient(config, fetcher).requireSignedUrls("../keys")).rejects.toMatchObject({ status: 422 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires both the account id and the API token (503 otherwise)", () => {
    expect(() => loadStreamVideoApiConfig({ CF_ACCOUNT_ID: ACCOUNT })).toThrow(expect.objectContaining({ status: 503 }));
    expect(() => loadStreamVideoApiConfig({ CF_STREAM_API_TOKEN: "t" })).toThrow(expect.objectContaining({ status: 503 }));
    expect(loadStreamVideoApiConfig({ CF_ACCOUNT_ID: ACCOUNT, CF_STREAM_API_TOKEN: " t " })).toEqual({ accountId: ACCOUNT, apiToken: "t" });
  });
});
