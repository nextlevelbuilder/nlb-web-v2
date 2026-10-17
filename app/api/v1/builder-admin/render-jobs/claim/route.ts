import { getDb } from "@/lib/db";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { claimNextRenderJob, requireRenderer, serializeRenderJobForAdmin } from "@/lib/builder-league/render-jobs";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/builder-admin/render-jobs/claim — leases the next due render job to the caller and
 * returns the public-safe scenes to render, or `{ job: null }` when the queue is empty.
 */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireRenderer(request, db);
    const claimed = await claimNextRenderJob(db);
    if (!claimed) return ok({ job: null });
    return ok({
      job: serializeRenderJobForAdmin(claimed.job),
      lease: claimed.lease,
      displayName: claimed.displayName,
      review: claimed.review,
    });
  });
}
