import { createHash } from "crypto";
import type { AppDb } from "@/lib/db";
import { operatorAuditLogs } from "@/lib/db/schema";
import type { SubjectAuthType } from "@/lib/access/types";

/**
 * Append-only operator audit trail (`operator_audit_logs`). This module only inserts; no code path
 * updates or deletes audit rows. `details` must stay a small, non-personal summary (ids, statuses).
 */

/**
 * Canonical JSON: object keys sorted recursively, array order kept, `undefined` members dropped (as
 * JSON.stringify does). Values JSON cannot represent faithfully are rejected so two different argument
 * sets can never share a hash.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("Operator arguments must not contain non-finite numbers");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
      if (value instanceof Date) return JSON.stringify(value.toISOString());
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new TypeError("Operator arguments must be plain JSON objects");
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
    }
    default:
      throw new TypeError(`Operator arguments must be JSON values, got ${typeof value}`);
  }
}

/** sha256 hex of the canonical JSON arguments; binds an approval to exactly these arguments. */
export function hashOperatorArgs(args: unknown): string {
  return createHash("sha256").update(canonicalJson(args ?? {})).digest("hex");
}

export interface OperatorAuditEntry {
  actorUserId: string | null;
  actorAuthType: SubjectAuthType;
  clientId?: string | null;
  action: string;
  resource: string;
  decision: "allow" | "deny";
  reason?: string | null;
  argsHash?: string | null;
  approvalId?: string | null;
  details?: Record<string, unknown> | null;
  now?: Date;
}

/** Appends one audit row and returns its id. Throws on failure so callers can fail closed. */
export async function recordOperatorAudit(db: AppDb, entry: OperatorAuditEntry): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(operatorAuditLogs).values({
    id,
    actorUserId: entry.actorUserId,
    actorAuthType: entry.actorAuthType,
    clientId: entry.clientId ?? null,
    action: entry.action,
    resource: entry.resource,
    decision: entry.decision,
    reason: entry.reason ?? null,
    argsHash: entry.argsHash ?? null,
    approvalId: entry.approvalId ?? null,
    details: entry.details ?? null,
    createdAt: entry.now ?? new Date(),
  });
  return id;
}
