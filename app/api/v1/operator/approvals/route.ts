import { createApproval, listApprovals } from "@/lib/operators/http/operator-approval-routes";

export const dynamic = "force-dynamic";

/** Approvals of `?domain=` (see lib/operators/http/operator-approval-routes.ts). */
export const GET = (request: Request) => listApprovals(request);

/** Request a two-person approval for a sensitive action of `?domain=`. */
export const POST = (request: Request) => createApproval(request);
