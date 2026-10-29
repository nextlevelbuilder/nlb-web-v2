import { getDb } from "@/lib/db";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { listRenderJobsForAdmin, serializeRenderJobForAdmin, type RenderJob } from "@/lib/builder-league/render-jobs";
import { requireRenderer } from "@/lib/builder-league/admin-key-auth";

export const dynamic = "force-dynamic";

const STATUSES = new Set<RenderJob["status"]>(["queued", "claimed", "done", "failed", "expired"]);

/** GET /api/v1/builder-admin/render-jobs[?status=] — the latest 100 render jobs (admin session or `builder:render` API key). */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireRenderer(request, db);
    const raw = new URL(request.url).searchParams.get("status") as RenderJob["status"] | null;
    const jobs = await listRenderJobsForAdmin(db, raw && STATUSES.has(raw) ? raw : undefined);
    return ok({ jobs: jobs.map(serializeRenderJobForAdmin) });
  });
}
