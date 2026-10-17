import { z } from "zod";
import { getDb } from "@/lib/db";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { failRenderJob, requireRenderer, serializeRenderJobForAdmin } from "@/lib/builder-league/render-jobs";

export const dynamic = "force-dynamic";

const Body = z.object({ lease: z.number(), error: z.string().min(1).max(2000), permanent: z.boolean().optional() });

/** POST /api/v1/builder-admin/render-jobs/{id}/fail — reports a failed render; retried with backoff. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireRenderer(request, db);
    const { id } = await context.params;
    const body = Body.parse(await request.json().catch(() => ({})));
    const job = await failRenderJob(db, { id, lease: body.lease, error: body.error, permanent: body.permanent });
    return ok({ job: serializeRenderJobForAdmin(job) });
  });
}
