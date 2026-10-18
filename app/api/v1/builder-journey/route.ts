import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { ok, parseCursor, parseLimit, withBuilderErrors } from "@/lib/builder-league/http";
import { getJourney, paginateJourney } from "@/lib/builder-league/journey";

export const dynamic = "force-dynamic";

/** GET /api/v1/builder-journey — the caller's own journey, oldest first, keyset-paginated. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const params = new URL(request.url).searchParams;
    const cursor = parseCursor(params.get("cursor"));
    const limit = parseLimit(params.get("limit"), 50, 200);
    const journey = await getJourney(db, caller.user.id);
    const page = paginateJourney(journey.items, { cursor, limit, projectId: params.get("project") });
    return ok({ items: page.items, projects: journey.projects }, { nextCursor: page.nextCursor, limit });
  });
}
