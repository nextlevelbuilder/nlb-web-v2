import { ok } from "@/lib/builder-league/http";
import { listPublishedVideos, toPublicCourseVideo } from "@/lib/courses/course-video-service";
import { listTranscriptVideoIds } from "@/lib/courses/course-transcript-service";
import { isAllowed, requireUserId, runMemberRoute } from "@/lib/access/http/member-route";

export const dynamic = "force-dynamic";

/**
 * The signed-in member's Courses library: every published video with `canWatch` decided by the shared
 * policy (`video:<id>` watch). `?owned=true` keeps only the videos the member can watch now.
 */
export async function GET(request: Request) {
  return runMemberRoute(request, async (context) => {
    requireUserId(context);
    const ownedOnly = new URL(request.url).searchParams.get("owned") === "true";
    const [videos, transcripts] = await Promise.all([listPublishedVideos(context.db), listTranscriptVideoIds(context.db)]);
    const items = [];
    for (const video of videos) {
      const canWatch = await isAllowed(context, "watch", { kind: "video", id: video.id, polarProductId: video.polarProductId });
      if (ownedOnly && !canWatch) continue;
      items.push({ ...toPublicCourseVideo(video, transcripts.has(video.id)), canWatch });
    }
    return ok(items);
  });
}
