import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { requestLocale, serializeClaim, serializeMemberReward } from "@/lib/builder-league/progression-api";
import { listMemberClaims, listRewardsForMember } from "@/lib/builder-league/rewards";

export const dynamic = "force-dynamic";

/** Open and upcoming rewards with the caller's eligibility, plus the caller's claim history. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const locale = requestLocale(request);
    const [rewards, claims] = await Promise.all([listRewardsForMember(db, caller.user.id), listMemberClaims(db, caller.user.id)]);
    return ok({ rewards: rewards.map((reward) => serializeMemberReward(reward, locale)), claims: claims.map(serializeClaim) });
  });
}
