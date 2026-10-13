import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canWatchVideo } from "@/lib/courses/course-video-access";
import { CourseError, courseNotFound } from "@/lib/courses/course-errors";
import { getCourseRuntimeEnv } from "@/lib/courses/course-runtime-env";
import { getVideoBySlug } from "@/lib/courses/course-video-service";
import { createSignedStreamPlayback, loadStreamSigningConfig } from "@/lib/courses/stream-signed-url";
import { readSlug, requireCaller, toErrorResponse, type RouteContext } from "@/lib/courses/course-route-helpers";

export const dynamic = "force-dynamic";

/**
 * Issue a short-lived signed Cloudflare Stream playback URL.
 * 401 anonymous, 404 unknown or draft, 403 no purchase or qualifying plan, 409 not signed-only on
 * Stream, 503 Stream not configured.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const caller = await requireCaller(request);
    const slug = await readSlug(context);
    const db = getDb();
    // Archived videos leave the catalogue but stay playable for people who already have access.
    const video = await getVideoBySlug(slug, db);
    if (!video || video.status === "draft") throw courseNotFound();
    if (!(await canWatchVideo(caller.user.id, video, db))) {
      throw new CourseError(403, "purchase_required", "Buy this video or join VIP to watch it");
    }
    if (!video.streamUid) {
      throw new CourseError(409, "video_not_ready", "This video is not ready for playback yet");
    }
    // Only uids Stream confirmed as signed-only get tokens; a public uid would play without one.
    if (!video.streamSignedOnly) {
      throw new CourseError(409, "stream_not_signed_only", "This video is not ready for playback yet");
    }
    const config = loadStreamSigningConfig(getCourseRuntimeEnv());
    const playback = await createSignedStreamPlayback(video.streamUid, config);
    return NextResponse.json({ data: playback }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toErrorResponse(error, "Issue course video token");
  }
}
