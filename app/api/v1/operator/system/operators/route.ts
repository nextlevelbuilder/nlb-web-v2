import { ok } from "@/lib/builder-league/http";
import { listOperators } from "@/lib/operators/operator-grants";
import { grantCapabilityRoute } from "@/lib/operators/http/operator-grant-routes";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

/** Every operator row with its exact capabilities; revoked rows are kept for history. Needs `system:manage`. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "system",
    action: "system.operators.list",
    prepare: async () => ({ resource: operatorDomainResource("system"), args: {} }),
    run: async ({ db }) => ok(await listOperators(db)),
  });
}

/** Grant one `<domain>:manage` capability (sensitive `operator.grant`, session only, approval required). */
export const POST = (request: Request) => grantCapabilityRoute(request);
