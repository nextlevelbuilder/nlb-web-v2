/**
 * JSON envelope and request plumbing for `/api/v1/builder-*`:
 * success `{ data, pagination? }`, failure `{ error: { code, message, details? } }`, always `no-store`.
 * Services throw `BuilderApiError`; routes wrap handlers in `withBuilderErrors` so unexpected errors are
 * logged and never leaked.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface Pagination {
  nextCursor: string | null;
  limit: number;
}

export class BuilderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "BuilderApiError";
  }
}

const NO_STORE = { "cache-control": "no-store" };

export function ok(data: unknown, pagination?: Pagination, status = 200): NextResponse {
  return NextResponse.json(pagination ? { data, pagination } : { data }, { status, headers: NO_STORE });
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  413: "Payload too large",
  422: "Unprocessable entity",
  429: "Too many requests",
  500: "Internal server error",
};

export function fail(status: number, code: string, details?: unknown, message?: string): NextResponse {
  const error = { code, message: message ?? DEFAULT_MESSAGES[status] ?? "Error", ...(details === undefined ? {} : { details }) };
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/** Converts anything thrown into the error envelope; unknown errors are logged, never leaked. */
export function builderErrorResponse(err: unknown): NextResponse {
  if (err instanceof BuilderApiError) return fail(err.status, err.code, err.details, err.message);
  if (err instanceof ZodError) {
    return fail(400, "validation_failed", err.errors.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
  console.error("builder api: unhandled error", err instanceof Error ? err.stack || err.message : err);
  return fail(500, "internal_error");
}

export async function withBuilderErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    return builderErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Keyset cursors: `{ at, id }` of the last item, base64url JSON. Opaque to clients.
// ---------------------------------------------------------------------------

export interface Cursor {
  at: number;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Null for a missing cursor; throws a 400 for a malformed one. */
export function parseCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      parsed && typeof parsed === "object" &&
      typeof (parsed as Cursor).at === "number" && Number.isFinite((parsed as Cursor).at) &&
      typeof (parsed as Cursor).id === "string" && (parsed as Cursor).id.length > 0
    ) {
      return { at: (parsed as Cursor).at, id: (parsed as Cursor).id };
    }
  } catch {
    // fall through
  }
  throw new BuilderApiError(400, "invalid_cursor", "Invalid cursor");
}

/** Page size from a query value, clamped to 1..max. */
export function parseLimit(value: string | null | undefined, fallback = 20, max = 100): number {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

// ---------------------------------------------------------------------------
// Per-user rate limiting (in-memory sliding window, per isolate)
// ---------------------------------------------------------------------------

export interface RateLimiter {
  /** True when the call is allowed; records it. */
  check(key: string): boolean;
}

/**
 * Sliding-window limiter kept in isolate memory, like the vote limiter. It is a best-effort abuse
 * brake, not a quota: each Worker isolate counts separately.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key: string): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, times] of hits) if (times.every((at) => now - at >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}

const writeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Throws 429 when `userId` exceeds 30 writes per minute on `bucket` (per isolate). */
export function enforceUserRateLimit(userId: string, bucket: string, limiter: RateLimiter = writeLimiter): void {
  if (!limiter.check(`${bucket}:${userId}`)) {
    throw new BuilderApiError(429, "rate_limited", "Too many requests. Please wait a minute and try again.");
  }
}
