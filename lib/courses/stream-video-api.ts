import { CourseError } from "./course-errors";
import type { CourseRuntimeEnv } from "./course-runtime-env";

const STREAM_UID_PATTERN = /^[a-f0-9]{32}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/;

export interface StreamVideoApiConfig {
  accountId: string;
  apiToken: string;
}

/** Marks a Stream video signed-only and confirms Stream reports it as such. */
export interface StreamVideoClient {
  requireSignedUrls(streamUid: string): Promise<void>;
}

/**
 * Read the Stream API credentials (account id var + API token secret with Stream: Edit). Missing
 * values raise 503: a video cannot be registered or published until signed-only playback can be
 * enforced on Stream itself.
 */
export function loadStreamVideoApiConfig(env: CourseRuntimeEnv): StreamVideoApiConfig {
  const accountId = env.CF_ACCOUNT_ID?.trim().toLowerCase();
  const apiToken = env.CF_STREAM_API_TOKEN?.trim();
  if (!accountId || !apiToken || !ACCOUNT_ID_PATTERN.test(accountId)) {
    console.error("Cloudflare Stream API is not configured; set CF_ACCOUNT_ID and CF_STREAM_API_TOKEN");
    throw new CourseError(503, "stream_not_configured", "Cloudflare Stream is not configured");
  }
  return { accountId, apiToken };
}

export function assertStreamUid(streamUid: string): void {
  if (!STREAM_UID_PATTERN.test(streamUid)) {
    throw new CourseError(422, "invalid_stream_uid", "Stream uid must be 32 lowercase hex characters");
  }
}

interface StreamApiEnvelope {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: { uid?: string; requireSignedURLs?: boolean } | null;
}

/**
 * Stream API client. `POST /accounts/{id}/stream/{uid}` with `requireSignedURLs: true` edits the
 * video; the response is checked so a silently ignored edit can never leave a public video behind.
 */
export function createStreamVideoClient(config: StreamVideoApiConfig, fetcher: typeof fetch = fetch): StreamVideoClient {
  return {
    async requireSignedUrls(streamUid) {
      assertStreamUid(streamUid);
      const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${streamUid}`;
      let response: Response;
      try {
        response = await fetcher(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uid: streamUid, requireSignedURLs: true }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        console.error("Stream API request failed:", error instanceof Error ? error.message : error);
        throw new CourseError(502, "stream_unavailable", "Cloudflare Stream could not be reached");
      }
      const body = (await response.json().catch(() => null)) as StreamApiEnvelope | null;
      if (response.status === 404) {
        throw new CourseError(422, "stream_video_not_found", "No Cloudflare Stream video has this uid");
      }
      if (!response.ok || !body?.success) {
        const codes = body?.errors?.map((error) => error.code).join(",") || response.status;
        console.error(`Stream API refused the signed-only update (${codes})`);
        throw new CourseError(502, "stream_unavailable", "Cloudflare Stream rejected the update");
      }
      if (body.result?.requireSignedURLs !== true) {
        throw new CourseError(502, "stream_not_signed_only", "Cloudflare Stream did not confirm signed-only playback");
      }
    },
  };
}
