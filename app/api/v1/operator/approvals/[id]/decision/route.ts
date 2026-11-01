import { decideOperatorApproval } from "@/lib/operators/http/operator-approval-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Approve or reject a pending approval of `?domain=`; the decider must be a different operator. */
export const POST = (request: Request, { params }: Params) => decideOperatorApproval(request, params);
