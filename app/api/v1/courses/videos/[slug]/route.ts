import { BuilderApiError, ok } from "@/lib/builder-league/http";
import { getVideoBySlug, toPublicCourseVideo } from "@/lib/courses/course-video-service";
import { hasTranscript } from "@/lib/courses/course-transcript-service";
import { isAllowed, requirePathParam, runMemberRoute } from "@/lib/access/http/member-route";

export const dynamic = "force-dynamic";

/**
 * One published or archived video with `canWatch` for the caller (false for anonymous callers).
 * Archived videos stay visible here because people who bought them can still watch them.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return runMemberRoute(request, async (context) => {
    const slug = requirePathParam((await params).slug, "slug");
    const video = await getVideoBySlug(slug, context.db);
    if (!video || video.status === "draft") throw new BuilderApiError(404, "video_not_found", "Video not found");
    const canWatch = context.subject.userId
      ? await isAllowed(context, "watch", { kind: "video", id: video.id, polarProductId: video.polarProductId })
      : false;
    return ok({ ...toPublicCourseVideo(video, await hasTranscript(video.id, context.db)), status: video.status, canWatch });
  });
}
