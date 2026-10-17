/**
 * Error envelope for /api/v1/blog: `{ error: string, details?: unknown }`, plus `currentVersion` on
 * optimistic-concurrency conflicts. Services throw BlogApiError; routes turn anything thrown into JSON
 * via blogErrorResponse, which never leaks unexpected error messages.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodIssues } from "./blog-post-schema";

export class BlogApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: { details?: unknown; currentVersion?: number } = {}
  ) {
    super(message);
    this.name = "BlogApiError";
  }
}

export const badRequest = (message: string, details?: unknown) => new BlogApiError(400, message, details === undefined ? {} : { details });
export const validationFailed = (details: { path: string; message: string }[]) => new BlogApiError(400, "Validation failed", { details });
export const unauthorized = () => new BlogApiError(401, "Unauthorized");
export const forbidden = () => new BlogApiError(403, "Forbidden");
export const notFound = (message = "Post not found") => new BlogApiError(404, message);
export const versionConflict = (currentVersion: number) =>
  new BlogApiError(409, "Version conflict: the post changed since you loaded it. Reload and retry.", { currentVersion });
export const conflict = (message: string) => new BlogApiError(409, message);
export const payloadTooLarge = (message: string, details?: unknown) => new BlogApiError(413, message, details === undefined ? {} : { details });

export function blogErrorBody(err: BlogApiError): Record<string, unknown> {
  return {
    error: err.message,
    ...(err.extra.details === undefined ? {} : { details: err.extra.details }),
    ...(err.extra.currentVersion === undefined ? {} : { currentVersion: err.extra.currentVersion }),
  };
}

/** Converts anything thrown into a JSON error response; unknown errors are logged, never leaked. */
export function blogErrorResponse(err: unknown): NextResponse {
  if (err instanceof BlogApiError) return NextResponse.json(blogErrorBody(err), { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "Validation failed", details: zodIssues(err) }, { status: 400 });
  console.error("blog api: unhandled error", err instanceof Error ? err.stack || err.message : err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** True when a D1/SQLite error (possibly wrapped by Drizzle) is a UNIQUE constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  for (let current: unknown = err, depth = 0; current && depth < 4; depth++) {
    if (current instanceof Error && /UNIQUE constraint failed/i.test(current.message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
