import { readApproval } from "@/lib/operators/http/operator-approval-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One approval of `?domain=` with the canonical arguments behind its hash. */
export const GET = (request: Request, { params }: Params) => readApproval(request, params);
