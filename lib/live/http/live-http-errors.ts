/**
 * Error mapping for `/api/v1/live` and `/api/v1/live-admin`. Every route wraps its handler in
 * `withLiveErrors`, which turns domain and policy failures into the shared `/api/v1` envelope
 * (`{ error: { code, message, details? } }`, see lib/builder-league/http.ts):
 *
 * - `LiveError` keeps its status and stable code;
 * - `OperatorAccessError` (401/403 deny, 409 approval problems) keeps its status and code;
 * - `BuilderApiError` (same-site, rate limit, cursor) and `BlogApiError` (Idempotency-Key) keep theirs;
 * - meeting provider failures fail closed as 503 `meeting_provider_unavailable` / 502 `meeting_provider_failed`;
 * - zod validation errors become 400 `validation_failed`;
 * - anything else is logged and answered as a generic 500, never leaked.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BuilderApiError, builderErrorResponse, fail } from "@/lib/builder-league/http";
import { BlogApiError } from "@/lib/blog/blog-errors";
import { LiveError } from "@/lib/live/live-errors";
import { MeetingProviderError, MeetingProviderUnavailableError } from "@/lib/live/meetings/meeting-provider";
import { OperatorAccessError } from "@/lib/operators/operator-errors";
import type { DenyReason } from "@/lib/access/types";

/** HTTP status for an `authorize()` deny: no identity is 401, every other deny is 403. */
export function denyStatus(reason: DenyReason): 401 | 403 {
  return reason === "unauthenticated" ? 401 : 403;
}

/** A policy deny as a thrown error the route wrapper renders. */
export function accessDenied(reason: DenyReason): BuilderApiError {
  return new BuilderApiError(denyStatus(reason), reason, reason === "unauthenticated" ? "Sign in required" : "Access denied");
}

export function liveErrorResponse(err: unknown): NextResponse {
  if (err instanceof LiveError) return fail(err.status, err.code, undefined, err.message);
  if (err instanceof OperatorAccessError) return fail(err.status, err.code, undefined, err.message);
  if (err instanceof MeetingProviderUnavailableError) {
    return fail(503, "meeting_provider_unavailable", undefined, "The meeting provider is not configured");
  }
  if (err instanceof MeetingProviderError) {
    console.error("live api: meeting provider error", { status: err.status, message: err.message });
    return fail(502, "meeting_provider_failed", undefined, "The meeting provider refused the request; retry later");
  }
  if (err instanceof BlogApiError) {
    const code = err.status === 422 ? "idempotency_key_reused" : err.status === 409 ? "idempotency_in_progress" : "invalid_idempotency_key";
    return fail(err.status, code, err.extra.details, err.message);
  }
  if (err instanceof ZodError) {
    return fail(400, "validation_failed", err.errors.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
  // BuilderApiError and unknown errors (logged, generic 500).
  return builderErrorResponse(err);
}

export async function withLiveErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    return liveErrorResponse(err);
  }
}
