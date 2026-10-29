import { ok } from "@/lib/builder-league/http";
import { decideApproval } from "@/lib/operators/operator-approvals";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { approvalDecisionSchema } from "@/lib/live/http/live-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Approve or reject a pending approval. The decider must be a different operator holding the action's
 * capability; expired, already decided and self decisions are refused (409) and audited.
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    // The guard row; `decideApproval` adds its own `operator.approval.approve|reject` row.
    action: "live.approval.decide",
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
