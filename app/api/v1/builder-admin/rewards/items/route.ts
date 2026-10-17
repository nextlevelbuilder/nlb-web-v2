import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody, serializeAdminRewardItem } from "@/lib/builder-league/progression-api";
import { listRewardItems, upsertRewardItem, type RewardItemInput } from "@/lib/builder-league/rewards";

export const dynamic = "force-dynamic";

/** Every catalogue item, active or not. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireBuilderLeagueAdmin(request, db);
    return ok((await listRewardItems(db)).map(serializeAdminRewardItem));
  });
}

/** Creates or updates an item by `key`; audited. */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-admin-rewards");
    // `upsertRewardItem` validates the body with `rewardItemInputSchema`.
    const item = await upsertRewardItem(db, (await readJsonBody(request)) as RewardItemInput, { actorId: caller.user.id, actorRole: "admin" });
    return ok(serializeAdminRewardItem(item));
  });
}
