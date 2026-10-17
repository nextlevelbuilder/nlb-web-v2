import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { ok, parseLimit, withBuilderErrors } from "@/lib/builder-league/http";
import { getBuilderRankings } from "@/lib/builder-league/snapshots";

export const dynamic = "force-dynamic";

// GET /api/v1/builder-rankings?board&period&key - a builder board from its snapshot, opt-ins only,
// plus the caller's own position
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const params = new URL(request.url).searchParams;
    const result = await getBuilderRankings(db, {
      board: params.get("board"),
      period: params.get("period"),
      key: params.get("key"),
      viewerId: caller.user.id,
      limit: parseLimit(params.get("limit"), 50, 100),
    });
    return ok(result);
  });
}
