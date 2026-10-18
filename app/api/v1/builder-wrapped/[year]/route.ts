import { getDb } from "@/lib/db";
import { BuilderApiError, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { communityWrappedData, loadCommunityWrapped } from "@/lib/builder-league/community-wrapped";
import { localYear } from "@/lib/builder-league/time-windows";
import { isReviewableYear, parseYearParam, requirePublicBuilderSurface } from "@/lib/builder-league/wrapped-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/builder-wrapped/{year} — the public Community Wrapped aggregate: every metric names its
 * source, verification, timeframe and denominator; cohorts under the minimum are suppressed. Serves the
 * stored snapshot, which the hourly cron refreshes.
 */
export async function GET(request: Request, context: { params: Promise<{ year: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const year = parseYearParam((await context.params).year);
    await requirePublicBuilderSurface(request, db);
    if (!isReviewableYear(year, localYear(new Date()))) throw new BuilderApiError(404, "not_found", "Not found");
    const snapshot = await loadCommunityWrapped(db, year, new Date());
    return ok({ version: snapshot.version, createdAt: snapshot.createdAt.toISOString(), ...communityWrappedData(snapshot) });
  });
}
