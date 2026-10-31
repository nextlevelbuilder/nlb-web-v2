import { NextResponse } from "next/server";
import { CourseError } from "@/lib/courses/course-errors";
import { streamUidParamSchema } from "@/lib/courses/course-video-schemas";
import { requireAdmin, toErrorResponse } from "@/lib/courses/course-route-helpers";
import { defaultStreamUploadClient } from "@/lib/courses/course-video-service";

export const dynamic = "force-dynamic";

/**
 * Admin: Stream processing status of an uploaded video (state, readiness, signed-only flag, duration).
 * 200, 401/403 not an admin, 404 malformed uid, 422 unknown uid, 502 Stream refused, 503 not configured.
 */
export async function GET(request: Request, context: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(request);
    const parsed = streamUidParamSchema.safeParse((await context.params).uid);
    if (!parsed.success) throw new CourseError(404, "stream_video_not_found", "Upload not found");
    return NextResponse.json({ data: await defaultStreamUploadClient().getStatus(parsed.data) });
  } catch (error) {
    return toErrorResponse(error, "Read course upload status");
  }
}
