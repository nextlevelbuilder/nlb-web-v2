import { revokeCapabilityRoute } from "@/lib/operators/http/operator-grant-routes";

export const dynamic = "force-dynamic";

/** Revoke one capability (sensitive `operator.revoke`, session only, approval required). */
export const POST = (request: Request) => revokeCapabilityRoute(request);
