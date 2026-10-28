import { ok } from "@/lib/builder-league/http";
import { getApprovalView } from "@/lib/operators/operator-approval-reads";
import { LIVE_APPROVAL_ACTIONS, runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { liveNotFound } from "@/lib/live/live-errors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One approval with what it covers (action, resource, canonical arguments, reason, requester) and its
 * effective status, so the deciding operator can check it before `POST /decision`.
 */
export async function GET(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.approval.read",
    prepare: async ({ db, now }) => {
      const approvalId = requirePathParam((await params).id, "id");
      const approval = await getApprovalView(db, approvalId, now, LIVE_APPROVAL_ACTIONS);
      if (!approval) throw liveNotFound("Approval");
      return { resource: `approval:${approvalId}`, args: { approvalId }, approval };
    },
    run: async (_ctx, { approval }) => ok(approval),
  });
}
