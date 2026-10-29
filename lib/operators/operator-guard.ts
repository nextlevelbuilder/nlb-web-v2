import { and, eq, gt } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { operatorAuditLogs } from "@/lib/db/schema";
import { authorize } from "@/lib/access/authorize";
import type { AccessSubject, DenyReason, OperatorDomain } from "@/lib/access/types";
import { isSensitiveOperatorAction, sensitiveActionDomain } from "./operator-actions";
import { consumeApproval } from "./operator-approvals";
import { hashOperatorArgs, recordOperatorAudit } from "./operator-audit";
import { approvalError, denyError, OperatorAccessError } from "./operator-errors";

/** Window in which repeated denies of one user for one action and reason share a single audit row. */
export const DENY_AUDIT_WINDOW_MS = 60_000;
/** Access denies of a signed-in user; these are throttled, approval failures are always written. */
const THROTTLED_DENIES: ReadonlySet<DenyReason> = new Set([
  "banned",
  "email_unverified",
  "insufficient_scope",
  "credential_not_allowed",
  "no_entitlement",
  "not_operator",
  "missing_capability",
  "not_available",
]);

/**
 * Whether a deny should get an audit row. Anonymous traffic never writes one (anyone can loop an
 * operator URL, and an actor-less row carries no signal). A signed-in caller denied access writes at most
 * one row per action and reason per window, so probing cannot flood the append-only table. Approval failures are always
 * written.
 */
async function shouldAuditDeny(db: AppDb, actorUserId: string | null, action: string, code: string, now: Date): Promise<boolean> {
  if (code === "unauthenticated" || !actorUserId) return false;
  if (!THROTTLED_DENIES.has(code as DenyReason)) return true;
  const [recent] = await db
    .select({ id: operatorAuditLogs.id })
    .from(operatorAuditLogs)
    .where(
      and(
        eq(operatorAuditLogs.actorUserId, actorUserId),
        gt(operatorAuditLogs.createdAt, new Date(now.getTime() - DENY_AUDIT_WINDOW_MS)),
        eq(operatorAuditLogs.action, action),
        eq(operatorAuditLogs.decision, "deny"),
        eq(operatorAuditLogs.reason, code)
      )
    )
    .limit(1);
  return !recent;
}

export interface RequireOperatorInput {
  db: AppDb;
  subject: AccessSubject;
  domain: OperatorDomain;
  /** Dotted operator action, e.g. `live.event.create` or `live.ticket.refund`. */
  action: string;
  /** Canonical resource string the action targets, e.g. `live:event:<id>`. */
  resource: string;
  /** JSON arguments of the action; hashed into the audit row and matched against the approval. */
  args: unknown;
  /** Required for actions in SENSITIVE_OPERATOR_ACTIONS. */
  approvalId?: string | null;
  /** Small, non-personal summary stored on the audit row. */
  details?: Record<string, unknown>;
  now?: Date;
}

export interface OperatorGrant {
  actorUserId: string;
  argsHash: string;
  approvalId: string | null;
}

/**
 * Gate for every operator write, shared by REST and MCP. Checks `operator:<domain>` manage through
 * `authorize()`, consumes the approval for sensitive actions, and writes an audit row for the allow or
 * the deny (anonymous denies are not written and repeated signed-in denies are throttled, see
 * `shouldAuditDeny`). Throws `OperatorAccessError` (401/403/409) on refusal. An audit write failure on
 * the allow path aborts the action (fail closed).
 */
export async function requireOperator(input: RequireOperatorInput): Promise<OperatorGrant> {
  const { db, subject, domain, action, resource } = input;
  if (!action?.trim() || !resource?.trim()) throw new TypeError("action and resource are required");
  const now = input.now ?? new Date();
  const argsHash = hashOperatorArgs(input.args);
  const sensitive = isSensitiveOperatorAction(action);
  // Only sensitive actions consume an approval; an id passed for any other action is ignored.
  const approvalId = sensitive ? input.approvalId ?? null : null;
  const base = {
    actorUserId: subject.userId,
    actorAuthType: subject.authType,
    clientId: subject.clientId,
    action,
    resource,
    argsHash,
    approvalId,
    details: input.details,
    now,
  };
  const refuse = async (error: OperatorAccessError): Promise<never> => {
    try {
      if (await shouldAuditDeny(db, subject.userId, action, error.code, now)) {
        await recordOperatorAudit(db, { ...base, decision: "deny", reason: error.code });
      }
    } catch (auditError) {
      console.error("operator audit failed", auditError instanceof Error ? auditError.message : auditError);
    }
    throw error;
  };

  const decision = await authorize(
    { subject, action: "manage", resource: { kind: "operator", domain }, context: { now } },
    { db }
  );
  if (!decision.allow) return refuse(denyError(decision.reason));
  const actorUserId = subject.userId as string; // authorize() allowed, so the user exists.

  if (sensitive) {
    if (sensitiveActionDomain(action) !== domain) return refuse(approvalError("approval_domain_mismatch"));
    if (!approvalId) return refuse(approvalError("approval_required"));
    try {
      await consumeApproval(db, { approvalId, action, resource, argsHash, actorUserId, now });
    } catch (error) {
      if (error instanceof OperatorAccessError) return refuse(error);
      throw error;
    }
  }

  await recordOperatorAudit(db, { ...base, decision: "allow" });
  return { actorUserId, argsHash, approvalId };
}
