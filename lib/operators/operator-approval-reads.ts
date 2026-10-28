import { and, desc, eq, gt, inArray, isNull, lt, lte, or, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { operatorApprovals } from "@/lib/db/schema";
import type { OperatorApprovalStatus } from "@/lib/access/types";
import { encodeCursor, type Cursor, type Pagination } from "@/lib/builder-league/http";

/**
 * Read side of `operator_approvals`, so a deciding operator can see what they are asked to approve:
 * the action, canonical resource, the exact canonical arguments behind `argsHash`, the reason and the
 * requester. Expiry is applied lazily on writes, so the status shown here is the effective one: an
 * unconsumed pending or approved row past `expiresAt` reads as `expired`. Rows hold ids only.
 */

export const APPROVAL_STATUSES: readonly OperatorApprovalStatus[] = ["pending", "approved", "rejected", "consumed", "expired"];

export interface OperatorApprovalView {
  id: string;
  action: string;
  resource: string;
  /** Parsed canonical JSON arguments; `sha256(canonical JSON of args) === argsHash`. */
  args: unknown;
  argsHash: string;
  reason: string;
  requestedBy: string;
  status: OperatorApprovalStatus;
  expiresAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  consumedAt: Date | null;
}

type ApprovalRow = typeof operatorApprovals.$inferSelect;

function parseArgs(json: string | null): unknown {
  if (json === null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function effectiveStatus(row: ApprovalRow, now: Date): OperatorApprovalStatus {
  const open = row.status === "pending" || row.status === "approved";
  return open && !row.consumedAt && row.expiresAt.getTime() <= now.getTime() ? "expired" : row.status;
}

function toView(row: ApprovalRow, now: Date): OperatorApprovalView {
  return {
    id: row.id,
    action: row.action,
    resource: row.resource,
    args: parseArgs(row.args),
    argsHash: row.argsHash,
    reason: row.reason,
    requestedBy: row.requestedBy,
    status: effectiveStatus(row, now),
    expiresAt: row.expiresAt,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    consumedAt: row.consumedAt,
  };
}

/** SQL filter matching `effectiveStatus(row) === status`. */
function statusFilter(status: OperatorApprovalStatus, now: Date): SQL | undefined {
  switch (status) {
    case "pending":
    case "approved":
      return and(eq(operatorApprovals.status, status), gt(operatorApprovals.expiresAt, now));
    case "expired":
      return or(
        eq(operatorApprovals.status, "expired"),
        and(
          inArray(operatorApprovals.status, ["pending", "approved"]),
          isNull(operatorApprovals.consumedAt),
          lte(operatorApprovals.expiresAt, now)
        )
      );
    default:
      return eq(operatorApprovals.status, status);
  }
}

/** One approval by id, or null. */
export async function getApprovalView(db: AppDb, approvalId: string, now: Date): Promise<OperatorApprovalView | null> {
  const [row] = await db.select().from(operatorApprovals).where(eq(operatorApprovals.id, approvalId)).limit(1);
  return row ? toView(row, now) : null;
}

/** One page of approvals with the given effective status, newest request first. */
export async function listApprovalPage(
  db: AppDb,
  input: { status: OperatorApprovalStatus; cursor: Cursor | null; limit: number; now: Date }
): Promise<{ items: OperatorApprovalView[]; pagination: Pagination }> {
  const conditions = [
    statusFilter(input.status, input.now),
    input.cursor
      ? or(
          lt(operatorApprovals.createdAt, new Date(input.cursor.at)),
          and(eq(operatorApprovals.createdAt, new Date(input.cursor.at)), lt(operatorApprovals.id, input.cursor.id))
        )
      : undefined,
  ];
  const rows = await db
    .select()
    .from(operatorApprovals)
    .where(and(...conditions))
    .orderBy(desc(operatorApprovals.createdAt), desc(operatorApprovals.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > input.limit && last ? encodeCursor({ at: last.createdAt.getTime(), id: last.id }) : null;
  return { items: page.map((row) => toView(row, input.now)), pagination: { nextCursor, limit: input.limit } };
}
