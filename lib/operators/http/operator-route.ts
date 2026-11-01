/**
 * Route helper of `/api/v1/operator/<domain>/…`: the shared operator flow (./operator-flow.ts) rendered
 * with the operator error envelope. Operator routes never depend on feature flags, so a domain can be
 * prepared before launch.
 */
import type { OperatorDomain } from "@/lib/access/types";
import { BuilderApiError } from "@/lib/builder-league/http";
import { runOperatorFlow, type OperatorActionPlan, type OperatorFlowOptions } from "./operator-flow";
import { withOperatorErrors } from "./operator-http-errors";

export type { OperatorActionPlan, OperatorContext } from "./operator-flow";
export { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";

/** Resource recorded on rows of domain-wide reads and on rows written before the target is known. */
export const operatorDomainResource = (domain: OperatorDomain) => `operator:${domain}`;

export interface OperatorRouteOptions<P extends OperatorActionPlan> extends OperatorFlowOptions<P> {
  /** Refuse MCP delegations with 403 `session_required` (actions that must not run from an agent). */
  sessionOnly?: boolean;
}

export function runOperatorRoute<P extends OperatorActionPlan>(options: OperatorRouteOptions<P>): Promise<Response> {
  return withOperatorErrors(() =>
    runOperatorFlow({
      ...options,
      afterPreflight: (ctx) => {
        if (options.sessionOnly && ctx.caller.authType !== "session") {
          throw new BuilderApiError(403, "session_required", "This action requires a signed-in session");
        }
        options.afterPreflight?.(ctx);
      },
    })
  );
}
