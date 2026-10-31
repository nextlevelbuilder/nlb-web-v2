import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createCourseVideoSchema } from "@/lib/courses/course-video-schemas";
import { createVideo, listPublishedVideos, toPublicCourseVideo } from "@/lib/courses/course-video-service";
import { listTranscriptVideoIds } from "@/lib/courses/course-transcript-service";
import { readJsonBody, requireAdmin, toErrorResponse } from "@/lib/courses/course-route-helpers";

export const dynamic = "force-dynamic";

/** Public list of published course videos. */
export async function GET() {
  try {
    const db = getDb();
    const [videos, transcripts] = await Promise.all([listPublishedVideos(db), listTranscriptVideoIds(db)]);
    return NextResponse.json({ data: videos.map((video) => toPublicCourseVideo(video, transcripts.has(video.id))) });
  } catch (error) {
    return toErrorResponse(error, "List course videos");
  }
}

/** Admin: create a draft video. The Polar product is created later, on publish. */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = createCourseVideoSchema.parse(await readJsonBody(request));
    const video = await createVideo(input, getDb());
    return NextResponse.json({ data: { ...toPublicCourseVideo(video), status: video.status, streamUid: video.streamUid } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Create course video");
  }
}
