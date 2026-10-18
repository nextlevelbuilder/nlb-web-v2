import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { withBuilderErrors } from "@/lib/builder-league/http";
import { getRenderBucket, getRenderDownload } from "@/lib/builder-league/render-jobs";
import { parseYearParam } from "@/lib/builder-league/wrapped-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/builder-year/{year}/render/{jobId}/download[?part=poster] — the owner's finished video
 * (or still image). Never cached; other members get a 404.
 */
export async function GET(request: Request, context: { params: Promise<{ year: string; jobId: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { year: rawYear, jobId } = await context.params;
    const year = parseYearParam(rawYear);
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const part = new URL(request.url).searchParams.get("part") === "poster" ? "poster" : "video";
    const file = await getRenderDownload(db, getRenderBucket(), { userId: caller.user.id, year, jobId, part });
    return new Response(file.body, {
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.size),
        "content-disposition": `attachment; filename="${file.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
