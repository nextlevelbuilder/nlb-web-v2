import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canWatchVideo } from "@/lib/courses/course-video-access";
import { CourseError, courseNotFound } from "@/lib/courses/course-errors";
import { getVideoBySlug } from "@/lib/courses/course-video-service";
import {
  getTranscript,
  pageTranscript,
  putTranscript,
  putTranscriptSchema,
  searchTranscript,
  transcriptQuerySchema,
} from "@/lib/courses/course-transcript-service";
import { readJsonBody, readSlug, requireAdmin, requireCaller, toErrorResponse, type RouteContext } from "@/lib/courses/course-route-helpers";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Read a video's transcript, one page (`offset`, `limit` in characters) at a time, or only the
 * paragraphs matching `q`. Same audience as playback: buyers, qualifying plans and admins; also
 * reachable through the NLB MCP server (`mcp:read` delegation).
 * 401 anonymous, 404 unknown/draft video, 403 no access, 404 `transcript_not_found`.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const caller = await requireCaller(request, { mcpRead: true });
    const slug = await readSlug(context);
    const query = transcriptQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = getDb();
    const video = await getVideoBySlug(slug, db);
    if (!video || video.status === "draft") throw courseNotFound();
    if (caller.user.role !== "admin" && !(await canWatchVideo(caller.user.id, video, db))) {
      throw new CourseError(403, "purchase_required", "Buy this video or join Premium/VIP to read its transcript");
    }
    const transcript = await getTranscript(video.id, db);
    if (!transcript) throw new CourseError(404, "transcript_not_found", "This video has no transcript yet");
    const base = { slug: video.slug, title: video.title, updatedAt: transcript.updatedAt.toISOString() };
    if (query.q) {
      const matches = searchTranscript(transcript.content, query.q);
      return NextResponse.json({ data: { ...base, totalChars: transcript.content.length, query: query.q, matches } }, { headers: PRIVATE });
    }
    return NextResponse.json({ data: { ...base, ...pageTranscript(transcript.content, query.offset, query.limit) } }, { headers: PRIVATE });
  } catch (error) {
    return toErrorResponse(error, "Read course transcript");
  }
}

/** Admin: create or replace the transcript of a video (any status). */
export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireAdmin(request);
    const slug = await readSlug(context);
    const input = putTranscriptSchema.parse(await readJsonBody(request));
    const db = getDb();
    const video = await getVideoBySlug(slug, db);
    if (!video) throw courseNotFound();
    const saved = await putTranscript(video.id, input, db);
    return NextResponse.json({
      data: { slug: video.slug, totalChars: saved.content.length, source: saved.source, updatedAt: saved.updatedAt.toISOString() },
    });
  } catch (error) {
    return toErrorResponse(error, "Save course transcript");
  }
}
