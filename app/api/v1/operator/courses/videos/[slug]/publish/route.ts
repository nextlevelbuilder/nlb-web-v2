import { ok } from "@/lib/builder-league/http";
import { polar } from "@/lib/polar";
import { getVideoBySlug, publishVideo } from "@/lib/courses/course-video-service";
import { toOperatorVideo } from "@/lib/operators/http/operator-content-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** Enforce signed-only playback, create the Polar product (idempotent) and publish. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return runOperatorRoute({
    request,
    domain: "courses",
    action: "courses.video.publish",
    prepare: async ({ db }) => {
      const video = await getVideoBySlug(requirePathParam((await params).slug, "slug"), db);
      if (!video) throw operatorNotFound("Video");
      return { resource: `video:${video.id}`, args: { slug: video.slug }, slug: video.slug };
    },
    run: async ({ db }, { slug }) => ok(toOperatorVideo(await publishVideo(slug, db, polar))),
  });
}
