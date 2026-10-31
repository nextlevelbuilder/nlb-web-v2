import { ok } from "@/lib/builder-league/http";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { approvePayoutBatch, getPayoutBatch } from "@/lib/referrals/affiliate-payouts";
import { payoutBatchView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { batchApproveSchema } from "@/lib/referrals/http/affiliate-operator-schemas";
import { payoutApproveTarget } from "@/lib/referrals/http/affiliate-sensitive-targets";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Approve a draft batch (sensitive `affiliate.payout.approve`): needs an approval for
 * `{ action: "affiliate.payout.approve", target: { batchId } }` decided by a different operator.
 */
export async function POST(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.approve",
    prepare: async ({ db }) => {
      const batchId = requirePathParam((await params).id, "id");
      const { approvalId } = batchApproveSchema.parse((await readJsonObject(request)).body);
      await getPayoutBatch(db, batchId);
      return { ...payoutApproveTarget(batchId), approvalId, batchId };
    },
    run: async ({ db, now }, { batchId }, grant) =>
      ok(payoutBatchView(await approvePayoutBatch(db, batchId, { actorUserId: grant.actorUserId, approvalId: grant.approvalId }, now))),
  });
}
