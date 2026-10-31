import { ok } from "@/lib/builder-league/http";
import { decideApproval } from "@/lib/operators/operator-approvals";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { approvalDecisionSchema } from "@/lib/live/http/live-operator-schemas";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Approve or reject a pending affiliate approval. The decider must be a different operator holding
 * `affiliate:manage`; expired, already decided and self decisions are refused (409) and audited.
 */
export async function POST(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    // The guard row; `decideApproval` adds its own `operator.approval.approve|reject` row.
    action: "affiliate.approval.decide",
    prepare: async () => {
      const approvalId = requirePathParam((await params).id, "id");
      const { decision } = approvalDecisionSchema.parse((await readJsonObject(request)).body);
      return { resource: `approval:${approvalId}`, args: { approvalId, decision }, approvalId, decision };
    },
    run: async ({ db, subject, now }, { approvalId, decision }) => {
      const result = await decideApproval(db, { approvalId, subject, decision, now });
      return ok({ id: approvalId, status: result.status });
    },
  });
}
