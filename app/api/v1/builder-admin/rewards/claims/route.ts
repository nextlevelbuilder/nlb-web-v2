import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { BuilderApiError, ok, parseLimit, withBuilderErrors } from "@/lib/builder-league/http";
import { serializeClaim } from "@/lib/builder-league/progression-api";
import { REWARD_CLAIM_STATUSES, listClaimsForAdmin, type RewardClaimStatus } from "@/lib/builder-league/rewards";

export const dynamic = "force-dynamic";

/** Claims queue, newest first, optionally filtered by `?status=`. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireBuilderLeagueAdmin(request, db);
    const params = new URL(request.url).searchParams;
    const status = params.get("status") || undefined;
    if (status && !(REWARD_CLAIM_STATUSES as readonly string[]).includes(status)) {
      throw new BuilderApiError(400, "invalid_status", "Unknown claim status.");
    }
    const rows = await listClaimsForAdmin(db, { status: status as RewardClaimStatus | undefined, limit: parseLimit(params.get("limit"), 100, 500) });
    return ok(rows.map((row) => ({ ...serializeClaim(row.claim), memberName: row.memberName, rewardKey: row.rewardKey, rewardTitle: row.rewardTitle })));
  });
}
