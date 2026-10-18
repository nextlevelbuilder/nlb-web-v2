import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { buildBadgeViews, evaluateBadges, getBadgeAwards } from "@/lib/builder-league/badges";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { requestLocale } from "@/lib/builder-league/progression-api";

export const dynamic = "force-dynamic";

/** The badge catalogue with the caller's awards. Evaluates pending awards first (idempotent). */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    await evaluateBadges(db, caller.user.id);
    const awards = await getBadgeAwards(db, caller.user.id);
    return ok(buildBadgeViews(awards, requestLocale(request)));
  });
}
