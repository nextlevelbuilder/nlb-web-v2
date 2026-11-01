import type { AppDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { updateCourseVideoSchema } from "@/lib/courses/course-video-schemas";
import { getVideoBySlug, updateVideo } from "@/lib/courses/course-video-service";
import { toOperatorVideo } from "@/lib/operators/http/operator-content-queries";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorInvalid, operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

async function loadVideo(db: AppDb, slug: string) {
  const video = await getVideoBySlug(slug, db);
  if (!video) throw operatorNotFound("Video");
  return video;
}

/** One video, any status, with its Stream uid and Polar product. */
export async function GET(request: Request, { params }: Context) {
  return runOperatorRoute({
    request,
    domain: "courses",
    action: "courses.video.read",
    prepare: async ({ db }) => {
      const video = await loadVideo(db, requirePathParam((await params).slug, "slug"));
      return { resource: `video:${video.id}`, args: { slug: video.slug }, video };
    },
    run: async (_ctx, { video }) => ok(toOperatorVideo(video)),
  });
}

/**
 * Patch a video. Archiving is sensitive and has its own route (`POST …/archive` with an approval), so a
 * patch may only move an archived video back to draft.
 */
export async function PATCH(request: Request, { params }: Context) {
  return runOperatorRoute({
    request,
    domain: "courses",
    action: "courses.video.update",
    prepare: async ({ db }) => {
      const video = await loadVideo(db, requirePathParam((await params).slug, "slug"));
      const patch = updateCourseVideoSchema.parse((await readJsonObject(request)).body);
      if (patch.status === "archived") throw operatorInvalid("Archive through POST /api/v1/operator/courses/videos/{slug}/archive");
      return { resource: `video:${video.id}`, args: { slug: video.slug, fields: Object.keys(patch).sort() }, video, patch };
    },
    run: async ({ db }, { video, patch }) => ok(toOperatorVideo(await updateVideo(video.slug, patch, db))),
  });
}
