import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCaller, type ResolvedCaller } from "@/lib/auth-api-key";
import { CourseError } from "./course-errors";
import { courseSlugSchema } from "./course-video-schemas";

export type RouteContext = { params: Promise<{ slug: string }> };

export function errorJson(status: number, error: string, code: string, details?: unknown): NextResponse {
  return NextResponse.json(details === undefined ? { error, code } : { error, code, details }, { status });
}

/** Map any thrown value to a JSON response; unknown failures are logged and hidden behind a 500. */
export function toErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof CourseError) return errorJson(error.status, error.message, error.code);
  if (error instanceof z.ZodError) return errorJson(400, "Invalid request data", "validation_failed", error.errors);
  console.error(`${context} failed:`, error);
  return errorJson(500, "Internal server error", "internal");
}

/** Validate the `[slug]` route param; malformed slugs can never match a video, so they read as 404. */
export async function readSlug(context: RouteContext): Promise<string> {
  const { slug } = await context.params;
  const parsed = courseSlugSchema.safeParse(slug);
  if (!parsed.success) throw new CourseError(404, "video_not_found", "Video not found");
  return parsed.data;
}

/** Parse a JSON body; an empty body counts as `{}` so optional-only payloads may be omitted. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CourseError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export async function requireCaller(request: Request): Promise<ResolvedCaller> {
  const caller = await resolveCaller(request.headers);
  if (!caller) throw new CourseError(401, "unauthorized", "Sign in to continue");
  return caller;
}

export async function requireAdmin(request: Request): Promise<ResolvedCaller> {
  const caller = await requireCaller(request);
  if (caller.user.role !== "admin") throw new CourseError(403, "forbidden", "Admin access required");
  return caller;
}
