import { getDb } from "@/lib/db";
import { BuilderApiError, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { completeRenderJob, getRenderBucket, requireRenderer, serializeRenderJobForAdmin } from "@/lib/builder-league/render-jobs";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/builder-admin/render-jobs/{id}/complete — multipart form with `lease`, `video`
 * (video/mp4) and optional `poster` (image/png). Stores both in the private bucket and marks the job done.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireRenderer(request, db);
    const { id } = await context.params;
    const form = await request.formData().catch(() => null);
    if (!form) throw new BuilderApiError(400, "invalid_form", "Send multipart/form-data with lease and video.");
    const lease = Number(form.get("lease"));
    const video = form.get("video");
    const poster = form.get("poster");
    if (!Number.isFinite(lease) || !(video instanceof File)) throw new BuilderApiError(400, "invalid_form", "lease and video are required.");
    if (video.type && video.type !== "video/mp4") throw new BuilderApiError(415, "invalid_video_type", "video must be video/mp4.");
    if (poster instanceof File && poster.type && poster.type !== "image/png") throw new BuilderApiError(415, "invalid_poster_type", "poster must be image/png.");
    const job = await completeRenderJob(db, getRenderBucket(), {
      id,
      lease,
      video: await video.arrayBuffer(),
      poster: poster instanceof File ? await poster.arrayBuffer() : null,
    });
    return ok({ job: serializeRenderJobForAdmin(job) });
  });
}
