import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody } from "@/lib/builder-league/progression-api";
import { enrollInSeason, getSeasonOverview, type EnrollmentInput } from "@/lib/builder-league/seasons";

export const dynamic = "force-dynamic";

/** Current season, the caller's enrollment, weekly check-ins and archived placements. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    return ok(await getSeasonOverview(db, caller.user.id));
  });
}

/** Joins (or updates) the current or next season with a track and an optional goal. */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:write", db);
    enforceUserRateLimit(caller.user.id, "builder-seasons");
    // `enrollInSeason` validates the body with `enrollmentInputSchema`.
    const enrollment = await enrollInSeason(db, caller.user.id, (await readJsonBody(request)) as EnrollmentInput);
    return ok(enrollment);
  });
}
