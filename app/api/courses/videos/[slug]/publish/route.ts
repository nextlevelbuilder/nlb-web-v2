import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { polar } from "@/lib/polar";
import { publishVideo, toPublicCourseVideo } from "@/lib/courses/course-video-service";
import { readSlug, requireAdmin, toErrorResponse, type RouteContext } from "@/lib/courses/course-route-helpers";

export const dynamic = "force-dynamic";

/** Admin: create the video's Polar product (idempotent) and publish it. */
export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin(request);
    const slug = await readSlug(context);
    const video = await publishVideo(slug, getDb(), polar);
    return NextResponse.json({
      data: { ...toPublicCourseVideo(video), status: video.status, polarProductId: video.polarProductId },
    });
  } catch (error) {
    return toErrorResponse(error, "Publish course video");
  }
}
