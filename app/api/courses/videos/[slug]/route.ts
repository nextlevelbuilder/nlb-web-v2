import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resolveCaller } from "@/lib/auth-api-key";
import { canWatchVideo } from "@/lib/courses/course-video-access";
import { courseNotFound } from "@/lib/courses/course-errors";
import { updateCourseVideoSchema } from "@/lib/courses/course-video-schemas";
import { getPublishedVideoBySlug, toPublicCourseVideo, updateVideo } from "@/lib/courses/course-video-service";
import { hasTranscript } from "@/lib/courses/course-transcript-service";
import { readJsonBody, readSlug, requireAdmin, toErrorResponse, type RouteContext } from "@/lib/courses/course-route-helpers";

export const dynamic = "force-dynamic";

/** Public detail of a published video plus whether the caller may watch it. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const slug = await readSlug(context);
    const db = getDb();
    const video = await getPublishedVideoBySlug(slug, db);
    if (!video) throw courseNotFound();
    const caller = await resolveCaller(request.headers);
    const [hasAccess, transcript] = await Promise.all([
      caller ? canWatchVideo(caller.user.id, video, db) : false,
      hasTranscript(video.id, db),
    ]);
    return NextResponse.json({ data: { ...toPublicCourseVideo(video, transcript), hasAccess } });
  } catch (error) {
    return toErrorResponse(error, "Get course video");
  }
}

/** Admin: partial update (draft/archived status, metadata, price before the Polar product exists). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin(request);
    const slug = await readSlug(context);
    const patch = updateCourseVideoSchema.parse(await readJsonBody(request));
    const video = await updateVideo(slug, patch, getDb());
    return NextResponse.json({ data: { ...toPublicCourseVideo(video), status: video.status, streamUid: video.streamUid } });
  } catch (error) {
    return toErrorResponse(error, "Update course video");
  }
}
