import { closeSync, openSync, readSync, statSync } from "node:fs";

export class CoursesApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "CoursesApiError";
    this.status = status;
    this.code = code;
  }
}

export interface CourseVideo {
  id: string;
  slug: string;
  title: string;
  description: string;
  locale: string;
  weekNumber: number | null;
  durationSec: number;
  priceCents: number;
  currency: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  status?: string;
  streamUid?: string | null;
}

export interface CourseVideoInput {
  slug: string;
  title: string;
  description?: string;
  locale?: "en" | "vi";
  weekNumber?: number | null;
  streamUid?: string | null;
  durationSec?: number;
  priceCents: number;
  currency?: string;
  thumbnailUrl?: string | null;
}

export interface StreamUpload {
  streamUid: string;
  uploadUrl: string;
}

export interface StreamUploadStatus {
  streamUid: string;
  state: string;
  pctComplete: number | null;
  readyToStream: boolean;
  requireSignedUrls: boolean;
  durationSec: number;
  errorReason: string | null;
}

export interface CoursesClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** Talks to the admin course routes under `/api/courses/*` (not part of the public `/api/v1` contract). */
export class NlbCoursesClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: CoursesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20000;
  }

  listVideos(): Promise<CourseVideo[]> {
    return this.request<CourseVideo[]>("GET", "/api/courses/videos", undefined, false);
  }

  createUpload(input: { name: string; sizeBytes: number; maxDurationSec?: number }): Promise<StreamUpload> {
    return this.request<StreamUpload>("POST", "/api/courses/uploads", input);
  }

  getUpload(streamUid: string): Promise<StreamUploadStatus> {
    return this.request<StreamUploadStatus>("GET", `/api/courses/uploads/${encodeURIComponent(streamUid)}`);
  }

  createVideo(input: CourseVideoInput): Promise<CourseVideo> {
    return this.request<CourseVideo>("POST", "/api/courses/videos", input);
  }

  updateVideo(slug: string, changes: Record<string, unknown>): Promise<CourseVideo> {
    return this.request<CourseVideo>("PATCH", `/api/courses/videos/${encodeURIComponent(slug)}`, changes);
  }

  publishVideo(slug: string): Promise<CourseVideo> {
    return this.request<CourseVideo>("POST", `/api/courses/videos/${encodeURIComponent(slug)}/publish`);
  }

  private async request<T>(method: string, path: string, body?: unknown, authed = true): Promise<T> {
    if (authed && !this.apiKey) throw new Error("An admin API key is required: pass --api-key, set NLB_API_KEY, or run 'nlb config set api-key'.");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authed && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
      headers["x-api-key"] = this.apiKey;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err) {
      throw new Error(`Network request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = undefined;
    }
    if (!response.ok) {
      // Course routes answer `{ error, code, details? }`.
      const err = json as { error?: unknown; code?: unknown } | undefined;
      const code = typeof err?.code === "string" ? err.code : undefined;
      const message =
        response.status === 401
          ? "Sign-in required: the API key is missing, invalid or revoked."
          : response.status === 403
            ? "Course management requires an admin account API key."
            : typeof err?.error === "string" ? err.error : response.statusText || "request failed";
      throw new CoursesApiError(response.status, `API Error (HTTP ${response.status}${code ? ` ${code}` : ""}: ${message})`, code);
    }
    const data = (json as { data?: unknown } | undefined)?.data;
    if (data === undefined) throw new Error(`API returned an unexpected response for ${path}`);
    return data as T;
  }
}

/** 50 MiB: Stream wants tus chunks in multiples of 256 KiB. */
export const TUS_CHUNK_BYTES = 256 * 1024 * 200;

export interface TusUploadOptions {
  fetchFn?: typeof fetch;
  chunkBytes?: number;
  maxAttempts?: number;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

/**
 * Sends a file to a one-time tus upload URL (from `createUpload`). The URL carries its own authorization,
 * so no credentials are sent. Resumes from the server's offset when a chunk fails, so a rerun continues too.
 */
export async function tusUpload(filePath: string, uploadUrl: string, options: TusUploadOptions = {}): Promise<void> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const chunkBytes = options.chunkBytes ?? TUS_CHUNK_BYTES;
  const maxAttempts = options.maxAttempts ?? 5;
  const size = statSync(filePath).size;
  const tus = { "Tus-Resumable": "1.0.0" };

  const serverOffset = async (): Promise<number | undefined> => {
    try {
      const head = await fetchFn(uploadUrl, { method: "HEAD", headers: tus });
      const value = head.headers.get("upload-offset");
      return value === null ? undefined : Number(value);
    } catch {
      return undefined;
    }
  };

  let offset = (await serverOffset()) ?? 0;
  const fd = openSync(filePath, "r");
  try {
    while (offset < size) {
      const length = Math.min(chunkBytes, size - offset);
      const chunk = Buffer.alloc(length);
      readSync(fd, chunk, 0, length, offset);
      let lastError = "";
      let advanced = false;
      for (let attempt = 1; attempt <= maxAttempts && !advanced; attempt++) {
        try {
          const res = await fetchFn(uploadUrl, {
            method: "PATCH",
            headers: { ...tus, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
            body: chunk
          });
          if (res.status === 204) {
            offset = Number(res.headers.get("upload-offset") ?? offset + length);
            advanced = true;
            break;
          }
          lastError = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
        const recovered = await serverOffset();
        if (recovered !== undefined && recovered !== offset) {
          offset = recovered;
          advanced = true;
        }
      }
      if (!advanced) throw new Error(`Upload stopped at byte ${offset} of ${size}: ${lastError}`);
      options.onProgress?.(offset, size);
    }
  } finally {
    closeSync(fd);
  }
}

/** ASCII slug from a (Vietnamese) title: "NLB Weekly #41: Bài học" -> "nlb-weekly-41-bai-hoc". */
export function slugifyTitle(title: string): string {
  return title
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

/** Recording date from a `record-YYMMDD.mp4` file name, as YYYY-MM-DD. */
export function dateFromRecordingName(filePath: string): string | undefined {
  const match = /record-(\d{2})(\d{2})(\d{2})/i.exec(filePath.split(/[\\/]/).pop() ?? "");
  if (!match) return undefined;
  const [, yy, mm, dd] = match;
  const date = `20${yy}-${mm}-${dd}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? undefined : date;
}

/** Next NLB Weekly number: one past the highest published week. */
export function nextWeekNumber(videos: Pick<CourseVideo, "weekNumber">[]): number {
  return videos.reduce((max, v) => Math.max(max, v.weekNumber ?? 0), 0) + 1;
}
