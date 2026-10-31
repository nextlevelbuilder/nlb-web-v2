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

/** Stream's per-video duration cap; also the default upload limit. */
export const STREAM_MAX_DURATION_SEC = 6 * 60 * 60;

export interface StreamUploadInput {
  /** Shown in the Stream dashboard, e.g. "41 - 2026-10-17 - Cường Võ". */
  name: string;
  sizeBytes: number;
  maxDurationSec?: number;
}

/** A one-time tus endpoint: the uploader PATCHes bytes to `uploadUrl` without any Cloudflare credential. */
export interface StreamUpload {
  streamUid: string;
  uploadUrl: string;
}

export interface StreamVideoStatus {
  streamUid: string;
  /** Stream processing state: pendingupload, downloading, queued, inprogress, ready or error. */
  state: string;
  pctComplete: number | null;
  readyToStream: boolean;
  requireSignedUrls: boolean;
  /** Whole seconds; 0 until Stream knows the duration. */
  durationSec: number;
  errorReason: string | null;
}

/** Creates direct (tus) uploads and reads processing status, so uploaders never hold the Stream API token. */
export interface StreamUploadClient {
  createUpload(input: StreamUploadInput): Promise<StreamUpload>;
  getStatus(streamUid: string): Promise<StreamVideoStatus>;
}

function base64Utf8(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

interface StreamVideoEnvelope {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: {
    uid?: string;
    readyToStream?: boolean;
    requireSignedURLs?: boolean;
    duration?: number;
    status?: { state?: string; pctComplete?: string | number; errorReasonCode?: string; errorReasonText?: string };
  } | null;
}

/**
 * Stream upload client. `POST /stream?direct_user=true` with tus headers reserves a uid and returns a
 * one-time upload URL; `requiresignedurls` in the metadata makes the video signed-only from its first
 * byte, so it is never publicly playable, not even before it is registered as a course video.
 */
export function createStreamUploadClient(config: StreamVideoApiConfig, fetcher: typeof fetch = fetch): StreamUploadClient {
  const accountUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`;

  async function call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetcher(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      console.error("Stream API request failed:", error instanceof Error ? error.message : error);
      throw new CourseError(502, "stream_unavailable", "Cloudflare Stream could not be reached");
    }
  }

  return {
    async createUpload({ name, sizeBytes, maxDurationSec = STREAM_MAX_DURATION_SEC }) {
      const metadata = [
        `name ${base64Utf8(name)}`,
        "requiresignedurls",
        `maxdurationseconds ${base64Utf8(String(maxDurationSec))}`,
      ].join(",");
      const response = await call(`${accountUrl}?direct_user=true`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(sizeBytes),
          "Upload-Metadata": metadata,
        },
      });
      const uploadUrl = response.headers.get("location") ?? "";
      const streamUid = response.headers.get("stream-media-id") ?? "";
      if (response.status !== 201 || !uploadUrl.startsWith("https://") || !STREAM_UID_PATTERN.test(streamUid)) {
        console.error(`Stream refused the upload reservation (${response.status})`);
        throw new CourseError(502, "stream_unavailable", "Cloudflare Stream did not create the upload");
      }
      return { streamUid, uploadUrl };
    },

    async getStatus(streamUid) {
      assertStreamUid(streamUid);
      const response = await call(`${accountUrl}/${streamUid}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.apiToken}` },
      });
      if (response.status === 404) {
        throw new CourseError(422, "stream_video_not_found", "No Cloudflare Stream video has this uid");
      }
      const body = (await response.json().catch(() => null)) as StreamVideoEnvelope | null;
      if (!response.ok || !body?.success || !body.result) {
        console.error(`Stream API refused the status read (${response.status})`);
        throw new CourseError(502, "stream_unavailable", "Cloudflare Stream rejected the status read");
      }
      const { result } = body;
      const pct = Number(result.status?.pctComplete);
      return {
        streamUid,
        state: result.status?.state ?? "unknown",
        pctComplete: Number.isFinite(pct) ? pct : null,
        readyToStream: result.readyToStream === true,
        requireSignedUrls: result.requireSignedURLs === true,
        durationSec: result.duration && result.duration > 0 ? Math.round(result.duration) : 0,
        errorReason: result.status?.errorReasonText || result.status?.errorReasonCode || null,
      };
    },
  };
}
