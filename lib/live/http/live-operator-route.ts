/**
 * Shared flow of every `/api/v1/live-admin` route. Operator routes work whatever `LIVE_ENABLED` says,
 * so events can be prepared before launch.
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
import { getDb, type AppDb } from "@/lib/db";
import { authorize } from "@/lib/access/authorize";
import type { AccessSubject } from "@/lib/access/types";
import { requireOperator, type OperatorGrant } from "@/lib/operators/operator-guard";
import { denyError } from "@/lib/operators/operator-errors";
import type { ResolvedCaller } from "@/lib/auth-api-key";
import { resolveLiveSubject } from "./live-request-context";
import { withLiveErrors } from "./live-http-errors";

export const LIVE_OPERATOR_DOMAIN = "live" as const;
/** Resource recorded on audit rows written before the target is known. */
export const LIVE_OPERATOR_RESOURCE = "operator:live";

export interface OperatorActionPlan {
  /** Canonical resource string, e.g. `live:event:<id>`. */
  resource: string;
  /** JSON arguments hashed into the audit row and matched against a sensitive action's approval. */
  args: unknown;
  approvalId?: string | null;
  /** Small, non-personal summary stored on the audit row. */
  details?: Record<string, unknown>;
}

export interface OperatorContext {
  db: AppDb;
  subject: AccessSubject & { userId: string };
  caller: ResolvedCaller;
  now: Date;
}

export interface OperatorRouteOptions<P extends OperatorActionPlan> {
  request: Request;
  /** Dotted operator action, e.g. `live.event.create`. */
  action: string;
  prepare: (ctx: OperatorContext) => Promise<P>;
  run: (ctx: OperatorContext, plan: P, grant: OperatorGrant) => Promise<Response>;
}

/** Runs the shared operator flow (see the module comment) inside the Live error envelope. */
export function runOperatorRoute<P extends OperatorActionPlan>(options: OperatorRouteOptions<P>): Promise<Response> {
  return withLiveErrors(async () => {
    const db = getDb();
    const now = new Date();
    const { caller, subject } = await resolveLiveSubject(options.request, db, "mcp:operator");

    const preflight = await authorize(
      { subject, action: "manage", resource: { kind: "operator", domain: LIVE_OPERATOR_DOMAIN }, context: { now } },
      { db }
    );
    if (!preflight.allow || !caller || !subject.userId) {
      // Writes the deny audit row and throws; the explicit throw covers a grant that appeared in between.
      await requireOperator({ db, subject, domain: LIVE_OPERATOR_DOMAIN, action: options.action, resource: LIVE_OPERATOR_RESOURCE, args: {}, now });
      throw denyError(preflight.allow ? "unauthenticated" : preflight.reason);
    }

    const ctx: OperatorContext = { db, subject: { ...subject, userId: subject.userId }, caller, now };
    const plan = await options.prepare(ctx);
    const grant = await requireOperator({
      db,
      subject,
      domain: LIVE_OPERATOR_DOMAIN,
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
