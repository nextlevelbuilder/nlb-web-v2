import { getDb } from "@/lib/db";
import { getMissionsCopy } from "@/content/builder-league/missions-copy";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { getMissionPlan } from "@/lib/builder-league/missions";
import { requestLocale } from "@/lib/builder-league/progression-api";

export const dynamic = "force-dynamic";

/** Stage-aware mission suggestions from the caller's verified history. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const plan = await getMissionPlan(db, caller.user.id);
    const copy = getMissionsCopy(requestLocale(request));
    return ok({
      ...plan,
      missions: plan.missions.map((mission) => ({ ...mission, ...copy.missions[mission.key] })),
    });
  });
}
