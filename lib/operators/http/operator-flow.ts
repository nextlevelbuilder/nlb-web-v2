/**
 * The operator flow shared by every operator REST route (Live, affiliate and `/api/v1/operator/*`).
 * Each route family renders errors with its own wrapper around this flow.
 *
 * 1. Resolve the caller; MCP delegations are accepted only when signed for `mcp:operator`.
 * 2. Preflight `operator:<domain>` manage through `authorize()`. A deny goes through `requireOperator`,
 *    which writes the audited deny row (none for anonymous callers, throttled for non-operators) and
 *    throws, so non-operators never learn whether a record exists and never reach input validation.
 * 3. `prepare` validates input and loads what the action targets (400/404 for operators only). It
 *    returns the canonical resource and the exact arguments a sensitive action's approval is bound to.
 * 4. `requireOperator` re-checks the capability, consumes the approval for sensitive actions and
 *    writes the allow row before the domain call runs (fail closed if the audit write fails).
 */
import { getDb, type AppDb } from "@/lib/db";
import { authorize } from "@/lib/access/authorize";
import type { AccessSubject, OperatorDomain } from "@/lib/access/types";
import type { ResolvedCaller } from "@/lib/auth-api-key";
import { requireOperator, type OperatorGrant } from "@/lib/operators/operator-guard";
import { denyError } from "@/lib/operators/operator-errors";
import { resolveLiveSubject } from "@/lib/live/http/live-request-context";

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

export interface OperatorFlowOptions<P extends OperatorActionPlan> {
  request: Request;
  domain: OperatorDomain;
  /** Dotted operator action, e.g. `courses.video.publish`. */
  action: string;
  /** Runs right after the preflight, so a refusal here still tells a non-operator nothing. */
  afterPreflight?: (ctx: OperatorContext) => void;
  prepare: (ctx: OperatorContext) => Promise<P>;
  run: (ctx: OperatorContext, plan: P, grant: OperatorGrant) => Promise<Response>;
}

/** Runs the shared flow (see the module comment). Throws on refusal; wrap it in an error renderer. */
export async function runOperatorFlow<P extends OperatorActionPlan>(options: OperatorFlowOptions<P>): Promise<Response> {
  const { domain } = options;
  const db = getDb();
  const now = new Date();
  const { caller, subject } = await resolveLiveSubject(options.request, db, "mcp:operator");

  const preflight = await authorize({ subject, action: "manage", resource: { kind: "operator", domain }, context: { now } }, { db });
  if (!preflight.allow || !caller || !subject.userId) {
    // Writes the deny audit row and throws; the explicit throw covers a grant that appeared in between.
    await requireOperator({ db, subject, domain, action: options.action, resource: `operator:${domain}`, args: {}, now });
    throw denyError(preflight.allow ? "unauthenticated" : preflight.reason);
  }

  const ctx: OperatorContext = { db, subject: { ...subject, userId: subject.userId }, caller, now };
  options.afterPreflight?.(ctx);
  const plan = await options.prepare(ctx);
  const grant = await requireOperator({
    db,
    subject,
    domain,
    action: options.action,
    resource: plan.resource,
    args: plan.args,
    approvalId: plan.approvalId ?? null,
    details: plan.details,
    now,
  });
  return options.run(ctx, plan, grant);
}
