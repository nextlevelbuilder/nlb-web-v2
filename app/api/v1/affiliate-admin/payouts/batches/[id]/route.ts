import { ok } from "@/lib/builder-league/http";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { getPayoutBatch } from "@/lib/referrals/affiliate-payouts";
import { payoutBatchDetailView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One batch with its items and totals. Payout details stay sealed (see `/payouts/items/{id}/details`). */
export async function GET(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.batch.read",
    prepare: async ({ db }) => {
      const batchId = requirePathParam((await params).id, "id");
      const found = await getPayoutBatch(db, batchId);
      return { resource: `affiliate:payout_batch:${batchId}`, args: { batchId }, found };
    },
    run: async (_ctx, { found }) => ok(payoutBatchDetailView(found.batch, found.items)),
  });
}
