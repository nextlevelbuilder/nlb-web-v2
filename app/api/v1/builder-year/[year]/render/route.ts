import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { RENDER_FORMATS, listRenderJobs, requestRender, serializeRenderJob } from "@/lib/builder-league/render-jobs";
import { localYear } from "@/lib/builder-league/time-windows";
import { isReviewableYear, parseYearParam } from "@/lib/builder-league/wrapped-access";
import { ensureYearSnapshot } from "@/lib/builder-league/year-review";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ year: string }> };

async function resolveYear(context: Context): Promise<number> {
  const year = parseYearParam((await context.params).year);
  if (!isReviewableYear(year, localYear(new Date()))) throw new BuilderApiError(404, "not_found", "Not found");
  return year;
}

/** GET /api/v1/builder-year/{year}/render — status of the caller's video renders for the year. */
export async function GET(request: Request, context: Context) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const year = await resolveYear(context);
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const jobs = await listRenderJobs(db, caller.user.id, year);
    return ok({ jobs: jobs.map(serializeRenderJob) });
  });
}

const Body = z.object({ format: z.enum(RENDER_FORMATS as [string, ...string[]]) });

/**
 * POST /api/v1/builder-year/{year}/render — queues a 9:16 or 16:9 video of the shared (public-safe)
 * scenes of the latest snapshot. Idempotent per snapshot and format.
 */
export async function POST(request: Request, context: Context) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const year = await resolveYear(context);
    const { caller } = await requireBuilderLeagueUser(request, "builder:write", db);
    enforceUserRateLimit(caller.user.id, "builder-render");
    const { format } = Body.parse(await request.json().catch(() => ({})));
    await ensureYearSnapshot(db, caller.user.id, year, new Date());
    const { job, created } = await requestRender(db, { userId: caller.user.id, year, format: format as "9x16" | "16x9" });
    return ok({ job: serializeRenderJob(job), created }, undefined, created ? 202 : 200);
  });
}
