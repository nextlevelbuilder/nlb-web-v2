import { and, eq, gt, inArray, isNull, lte, ne } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { operatorApprovals } from "@/lib/db/schema";
import { authorize } from "@/lib/access/authorize";
import type { AccessSubject, SensitiveOperatorAction } from "@/lib/access/types";
import { isSensitiveOperatorAction, sensitiveActionDomain } from "./operator-actions";
import { recordOperatorAudit } from "./operator-audit";
import { approvalError, denyError, OperatorAccessError } from "./operator-errors";

/**
 * Two-person approvals for sensitive operator actions (`operator_approvals`). An approval is requested
 * by one operator, decided by a different operator holding the action's capability, bound to the
 * argument hash, valid until `expires_at` and consumed exactly once by one conditional UPDATE. D1 has
 * no interactive transactions, so every state change is a single guarded statement whose changed-row
 * count decides success. Expiry is applied lazily when a stale row is touched.
 */

export const DEFAULT_APPROVAL_TTL_MS = 30 * 60 * 1000;
const MAX_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const ARGS_HASH = /^[0-9a-f]{64}$/;

type ApprovalRow = typeof operatorApprovals.$inferSelect;

async function loadApproval(db: AppDb, approvalId: string): Promise<ApprovalRow | null> {
  const [row] = await db.select().from(operatorApprovals).where(eq(operatorApprovals.id, approvalId)).limit(1);
  return row ?? null;
}

/** Marks a pending or approved, unconsumed approval past its expiry as `expired`. */
async function markExpired(db: AppDb, approvalId: string, now: Date): Promise<void> {
  await db
    .update(operatorApprovals)
    .set({ status: "expired" })
    .where(
      and(
        eq(operatorApprovals.id, approvalId),
        inArray(operatorApprovals.status, ["pending", "approved"]),
        isNull(operatorApprovals.consumedAt),
        lte(operatorApprovals.expiresAt, now)
      )
    );
}

async function assertOperatorFor(db: AppDb, subject: AccessSubject, action: SensitiveOperatorAction, now: Date): Promise<void> {
  const decision = await authorize(
    { subject, action: "manage", resource: { kind: "operator", domain: sensitiveActionDomain(action) }, context: { now } },
    { db }
  );
  if (!decision.allow) throw denyError(decision.reason);
}

export interface RequestApprovalInput {
  subject: AccessSubject;
  action: SensitiveOperatorAction;
  /** Canonical resource string the action targets, e.g. `live:ticket:<eventId>`. */
  resource: string;
  argsHash: string;
  reason: string;
  ttlMs?: number;
  now?: Date;
}

/** Creates a pending approval. The requester must hold the action's capability. */
export async function requestApproval(db: AppDb, input: RequestApprovalInput): Promise<{ id: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_APPROVAL_TTL_MS;
  if (!isSensitiveOperatorAction(input.action)) throw new TypeError("Approvals exist only for sensitive operator actions");
  if (!input.resource?.trim()) throw new TypeError("resource is required");
  if (!ARGS_HASH.test(input.argsHash)) throw new TypeError("argsHash must be a sha256 hex digest");
  const reason = input.reason?.trim();
  if (!reason || reason.length > 500) throw new TypeError("reason must be 1-500 characters");
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_APPROVAL_TTL_MS) throw new TypeError("ttlMs is out of range");

  await assertOperatorFor(db, input.subject, input.action, now);
  const requestedBy = input.subject.userId as string; // authorize() allowed, so the user exists.
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + ttlMs);
  await db.insert(operatorApprovals).values({
    id, action: input.action, resource: input.resource, argsHash: input.argsHash, reason, requestedBy,
    status: "pending", expiresAt, createdAt: now,
  });
  await recordOperatorAudit(db, {
    actorUserId: requestedBy, actorAuthType: input.subject.authType, clientId: input.subject.clientId,
    action: "operator.approval.request", resource: input.resource, decision: "allow",
    argsHash: input.argsHash, approvalId: id, details: { requestedAction: input.action }, now,
  });
  return { id, expiresAt };
}

export interface DecideApprovalInput {
  approvalId: string;
  /** The deciding operator; must differ from the requester. */
  subject: AccessSubject;
  decision: "approve" | "reject";
  now?: Date;
}

/** Approves or rejects a pending, unexpired approval. Every outcome is audited. */
export async function decideApproval(db: AppDb, input: DecideApprovalInput): Promise<{ status: "approved" | "rejected" }> {
  const now = input.now ?? new Date();
  const auditAction = `operator.approval.${input.decision}`;
  const row = await loadApproval(db, input.approvalId);
  const audit = (decision: "allow" | "deny", reason?: string) =>
    recordOperatorAudit(db, {
      actorUserId: input.subject.userId, actorAuthType: input.subject.authType, clientId: input.subject.clientId,
      action: auditAction, resource: row?.resource ?? `approval:${input.approvalId}`, decision, reason,
      argsHash: row?.argsHash, approvalId: input.approvalId, now,
    });
  const refuse = async (error: OperatorAccessError): Promise<never> => {
    await audit("deny", error.code).catch((auditError) => console.error("operator audit failed", auditError));
    throw error;
  };

  if (!row) return refuse(approvalError("approval_not_found"));
  if (!isSensitiveOperatorAction(row.action)) return refuse(approvalError("approval_domain_mismatch"));
  if (row.status === "pending" && row.expiresAt.getTime() <= now.getTime()) {
    await markExpired(db, row.id, now);
    return refuse(approvalError("approval_expired"));
  }
  if (row.status !== "pending") return refuse(approvalError("approval_not_pending"));
  if (!input.subject.userId || input.subject.userId === row.requestedBy) {
    return refuse(input.subject.userId ? approvalError("approval_self_decision") : denyError("unauthenticated"));
  }
  try {
    await assertOperatorFor(db, input.subject, row.action, now);
  } catch (error) {
    if (error instanceof OperatorAccessError) return refuse(error);
    throw error;
  }

  const status = input.decision === "approve" ? "approved" : "rejected";
  const changed = await db
    .update(operatorApprovals)
    .set({ status, decidedBy: input.subject.userId, decidedAt: now })
    .where(
      and(
        eq(operatorApprovals.id, row.id),
        eq(operatorApprovals.status, "pending"),
        gt(operatorApprovals.expiresAt, now),
        ne(operatorApprovals.requestedBy, input.subject.userId)
      )
    )
    .returning({ id: operatorApprovals.id });
  if (changed.length !== 1) return refuse(approvalError("approval_not_pending"));
  await audit("allow");
  return { status };
}

export interface ConsumeApprovalInput {
  approvalId: string;
  action: string;
  resource: string;
  argsHash: string;
  /** The operator running the action; must be the one who requested the approval. */
  actorUserId: string;
  now?: Date;
}

/**
 * Consumes an approval with one conditional UPDATE. Exactly one caller can win; a replayed, expired,
 * mismatched or unapproved approval changes no rows and is refused with the most specific reason.
 */
export async function consumeApproval(db: AppDb, input: ConsumeApprovalInput): Promise<void> {
  const now = input.now ?? new Date();
  const changed = await db
    .update(operatorApprovals)
    .set({ status: "consumed", consumedAt: now })
    .where(
      and(
        eq(operatorApprovals.id, input.approvalId),
        eq(operatorApprovals.status, "approved"),
        isNull(operatorApprovals.consumedAt),
        gt(operatorApprovals.expiresAt, now),
        eq(operatorApprovals.action, input.action),
        eq(operatorApprovals.resource, input.resource),
        eq(operatorApprovals.argsHash, input.argsHash),
        eq(operatorApprovals.requestedBy, input.actorUserId)
      )
    )
    .returning({ id: operatorApprovals.id });
  if (changed.length === 1) return;

  const row = await loadApproval(db, input.approvalId);
  if (!row) throw approvalError("approval_not_found");
  if (row.status === "consumed" || row.consumedAt) throw approvalError("approval_already_used");
  if (row.status === "expired") throw approvalError("approval_expired");
  if (row.expiresAt.getTime() <= now.getTime()) {
    await markExpired(db, row.id, now);
    throw approvalError("approval_expired");
  }
  if (row.status !== "approved") throw approvalError("approval_not_approved");
  if (row.action !== input.action || row.resource !== input.resource || row.argsHash !== input.argsHash) {
    throw approvalError("approval_mismatch");
  }
  if (row.requestedBy !== input.actorUserId) throw approvalError("approval_not_requester");
  // The row matched every condition when re-read: another consumer raced between the two statements.
  throw approvalError("approval_already_used");
}
