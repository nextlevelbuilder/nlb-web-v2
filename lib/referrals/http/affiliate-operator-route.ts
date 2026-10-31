/**
 * Shared flow of every `/api/v1/affiliate-admin` route: the Live operator flow (see
 * lib/live/http/live-operator-route.ts) for the `affiliate` domain, rendered with the referral error
 * mapping. Operator routes work whatever `AFFILIATES_ENABLED` says, so rules and payouts can be
 * prepared before launch.
 *
 * 1. Resolve the caller; MCP delegations are accepted only when signed for `mcp:operator`.
 * 2. Preflight `operator:affiliate` manage through `authorize()`. A deny goes through `requireOperator`,
 *    which writes the audited deny row and throws, so non-operators never reach input validation.
 * 3. `prepare` validates input and loads the target (400/404 for operators only), returning the
 *    canonical resource and the exact arguments a sensitive action's approval is bound to.
 * 4. `requireOperator` re-checks the capability, consumes the approval for sensitive actions and writes
 *    the allow row before the domain call runs (fail closed if the audit write fails).
 */
import { getDb } from "@/lib/db";
import { authorize } from "@/lib/access/authorize";
import { SENSITIVE_OPERATOR_ACTIONS } from "@/lib/access/types";
import { requireOperator, type OperatorGrant } from "@/lib/operators/operator-guard";
import { denyError } from "@/lib/operators/operator-errors";
import type { OperatorActionPlan, OperatorContext } from "@/lib/live/http/live-operator-route";
import { resolveLiveSubject } from "@/lib/live/http/live-request-context";
import { withReferralErrors } from "./referral-http-errors";
import { assertSessionCaller } from "./referral-request-context";

export type { OperatorActionPlan, OperatorContext } from "@/lib/live/http/live-operator-route";

export const AFFILIATE_OPERATOR_DOMAIN = "affiliate" as const;
/** Resource recorded on audit rows of program-wide reads and on rows written before the target is known. */
export const AFFILIATE_OPERATOR_RESOURCE = "operator:affiliate";

/** Sensitive actions of the affiliate domain; affiliate approval reads never show any other approval. */
export const AFFILIATE_APPROVAL_ACTIONS = SENSITIVE_OPERATOR_ACTIONS.filter((action) => action.startsWith("affiliate."));

export interface AffiliateOperatorRouteOptions<P extends OperatorActionPlan> {
  request: Request;
  /** Dotted operator action, e.g. `affiliate.batch.create`. */
  action: string;
  /** Refuse MCP delegations with 403 `session_required` (payout details, recording payments). */
  sessionOnly?: boolean;
  prepare: (ctx: OperatorContext) => Promise<P>;
  run: (ctx: OperatorContext, plan: P, grant: OperatorGrant) => Promise<Response>;
}

export function runAffiliateOperatorRoute<P extends OperatorActionPlan>(options: AffiliateOperatorRouteOptions<P>): Promise<Response> {
  return withReferralErrors(async () => {
    const db = getDb();
    const now = new Date();
    const { caller, subject } = await resolveLiveSubject(options.request, db, "mcp:operator");

    const preflight = await authorize(
      { subject, action: "manage", resource: { kind: "operator", domain: AFFILIATE_OPERATOR_DOMAIN }, context: { now } },
      { db }
    );
    if (!preflight.allow || !caller || !subject.userId) {
      // Writes the deny audit row and throws; the explicit throw covers a grant that appeared in between.
      await requireOperator({ db, subject, domain: AFFILIATE_OPERATOR_DOMAIN, action: options.action, resource: AFFILIATE_OPERATOR_RESOURCE, args: {}, now });
      throw denyError(preflight.allow ? "unauthenticated" : preflight.reason);
    }
    // Checked after the operator preflight, so a non-operator still learns nothing beyond the deny.
    if (options.sessionOnly) assertSessionCaller(caller);

    const ctx: OperatorContext = { db, subject: { ...subject, userId: subject.userId }, caller, now };
    const plan = await options.prepare(ctx);
    const grant = await requireOperator({
      db,
      subject,
      domain: AFFILIATE_OPERATOR_DOMAIN,
      action: options.action,
      resource: plan.resource,
      args: plan.args,
      approvalId: plan.approvalId ?? null,
      details: plan.details,
      now,
    });
    return options.run(ctx, plan, grant);
  });
}
