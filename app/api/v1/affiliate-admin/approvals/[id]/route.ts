import { ok } from "@/lib/builder-league/http";
import { getApprovalView } from "@/lib/operators/operator-approval-reads";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { referralNotFound } from "@/lib/referrals/referral-errors";
import { AFFILIATE_APPROVAL_ACTIONS, runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One affiliate approval with what it covers and its effective status, to check before deciding. */
export async function GET(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.approval.read",
    prepare: async ({ db, now }) => {
      const approvalId = requirePathParam((await params).id, "id");
      const approval = await getApprovalView(db, approvalId, now, AFFILIATE_APPROVAL_ACTIONS);
      if (!approval) throw referralNotFound("Approval");
      return { resource: `approval:${approvalId}`, args: { approvalId }, approval };
    },
    run: async (_ctx, { approval }) => ok(approval),
  });
}
