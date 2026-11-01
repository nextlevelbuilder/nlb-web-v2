import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { serializeClaim } from "@/lib/builder-league/progression-api";
import { REWARD_CLAIM_STATUSES, listClaimsForAdmin } from "@/lib/builder-league/rewards";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(REWARD_CLAIM_STATUSES).nullable();

/** Reward claims, newest first; `?status=` filters, `?limit=` max 500. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.claim.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const filter = { status: statusSchema.parse(query.get("status")), limit: parseLimit(query.get("limit"), 100, 500) };
      return { resource: operatorDomainResource("builder_league"), args: filter, filter };
    },
    run: async ({ db }, { filter }) => {
      const rows = await listClaimsForAdmin(db, { status: filter.status ?? undefined, limit: filter.limit });
      return ok(rows.map((row) => ({ ...serializeClaim(row.claim), memberName: row.memberName, rewardKey: row.rewardKey, rewardTitle: row.rewardTitle })));
    },
  });
}
