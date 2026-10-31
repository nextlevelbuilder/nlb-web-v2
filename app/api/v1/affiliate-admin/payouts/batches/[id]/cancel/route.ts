import { ok } from "@/lib/builder-league/http";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { cancelPayoutBatch } from "@/lib/referrals/affiliate-payouts";
import { payoutBatchView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { emptySchema } from "@/lib/referrals/http/affiliate-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Cancel a draft or approved batch without recorded payments; locked amounts return to `available`. */
export async function POST(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.batch.cancel",
    prepare: async () => {
      const batchId = requirePathParam((await params).id, "id");
      emptySchema.parse((await readJsonObject(request)).body);
      return { resource: `affiliate:payout_batch:${batchId}`, args: { batchId }, batchId };
    },
    run: async ({ db, now }, { batchId }, grant) => ok(payoutBatchView(await cancelPayoutBatch(db, batchId, grant.actorUserId, now))),
  });
}
