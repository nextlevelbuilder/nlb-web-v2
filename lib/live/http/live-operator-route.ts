/**
 * Shared flow of every `/api/v1/live-admin` route (lib/operators/http/operator-flow.ts for the `live`
 * domain). Operator routes work whatever `LIVE_ENABLED` says, so events can be prepared before launch.
 *
 * 1. Resolve the caller; MCP delegations are accepted only when signed for `mcp:operator`.
 * 2. Preflight `operator:live` manage through `authorize()`. A deny goes through `requireOperator`,
 *    which writes the audited deny row (none for anonymous callers, throttled for non-operators) and
 *    throws, so non-operators never learn whether a record exists and never reach input validation.
 * 3. `prepare` validates input and loads what the action targets (400/404 for operators only). It
 *    returns the canonical resource and the exact arguments the approval is bound to.
 * 4. `requireOperator` re-checks the capability, consumes the approval for sensitive actions and
 *    writes the allow row before the domain call runs (fail closed if the audit write fails).
 */
import { SENSITIVE_OPERATOR_ACTIONS } from "@/lib/access/types";
import type { OperatorGrant } from "@/lib/operators/operator-guard";
import { runOperatorFlow, type OperatorActionPlan, type OperatorContext } from "@/lib/operators/http/operator-flow";
import { withLiveErrors } from "./live-http-errors";

export type { OperatorActionPlan, OperatorContext } from "@/lib/operators/http/operator-flow";

export const LIVE_OPERATOR_DOMAIN = "live" as const;
/** Resource recorded on audit rows written before the target is known. */
export const LIVE_OPERATOR_RESOURCE = "operator:live";

/** Sensitive actions of the Live domain; Live approval reads never show approvals outside this list. */
export const LIVE_APPROVAL_ACTIONS = SENSITIVE_OPERATOR_ACTIONS.filter((action) => action.startsWith("live."));

export interface OperatorRouteOptions<P extends OperatorActionPlan> {
  request: Request;
  /** Dotted operator action, e.g. `live.event.create`. */
  action: string;
  prepare: (ctx: OperatorContext) => Promise<P>;
  run: (ctx: OperatorContext, plan: P, grant: OperatorGrant) => Promise<Response>;
}

/** Runs the shared operator flow (see the module comment) inside the Live error envelope. */
export function runOperatorRoute<P extends OperatorActionPlan>(options: OperatorRouteOptions<P>): Promise<Response> {
  return withLiveErrors(() => runOperatorFlow({ ...options, domain: LIVE_OPERATOR_DOMAIN }));
}
