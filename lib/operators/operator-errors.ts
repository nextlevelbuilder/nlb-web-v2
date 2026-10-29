import type { DenyReason } from "@/lib/access/types";

/** Why an approval could not be requested, decided or consumed. */
export type ApprovalFailureCode =
  | "approval_required"
  | "approval_not_found"
  | "approval_not_pending"
  | "approval_expired"
  | "approval_self_decision"
  | "approval_mismatch"
  | "approval_not_requester"
  | "approval_already_used"
  | "approval_not_approved"
  | "approval_domain_mismatch";

export type OperatorErrorCode = DenyReason | ApprovalFailureCode;

/**
 * Typed operator failure carrying an HTTP status, shared by REST and MCP layers (no NextResponse here).
 * 401: no usable identity. 403: policy deny. 409: approval problems.
 */
export class OperatorAccessError extends Error {
  constructor(
    readonly status: 401 | 403 | 409,
    readonly code: OperatorErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "OperatorAccessError";
  }
}

export function denyError(reason: DenyReason): OperatorAccessError {
  return new OperatorAccessError(reason === "unauthenticated" ? 401 : 403, reason);
}

export function approvalError(code: ApprovalFailureCode, message?: string): OperatorAccessError {
  return new OperatorAccessError(409, code, message);
}
