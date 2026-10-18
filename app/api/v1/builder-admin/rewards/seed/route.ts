import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { seedRewardCatalogue } from "@/lib/builder-league/rewards";

export const dynamic = "force-dynamic";

/** Adds the initial catalogue as inactive items; existing keys are left untouched. */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-admin-rewards");
    const created = await seedRewardCatalogue(db, { actorId: caller.user.id, actorRole: "admin" });
    return ok({ created });
  });
}
