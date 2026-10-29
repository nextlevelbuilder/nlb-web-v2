import { isOperatorCapability } from "./operator-grants";
import type { OperatorCapability } from "@/lib/access/types";

/**
 * SQL for granting operator capabilities out of band (scripts/grant-platform-operator.ts). The first
 * operator cannot be approved by a second one, so bootstrap grants are applied by a maintainer with
 * D1 access; later grants go through the `operator.grant` approval flow.
 */

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_NOTE = 200;

export interface BootstrapGrantInput {
  userId: string;
  capabilities: readonly string[];
  grantedBy: string;
  note?: string | null;
  nowMs: number;
}

function quoteId(value: string, field: string): string {
  if (!SAFE_ID.test(value)) throw new Error(`${field} must match ${SAFE_ID}`);
  return `'${value}'`;
}

function quoteText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * One upsert that sets the operator's capability list to exactly `capabilities` and clears any
 * revocation. Capabilities are validated against the known domains; there is no wildcard.
 */
export function bootstrapGrantSql(input: BootstrapGrantInput): string {
  const capabilities = [...new Set(input.capabilities.map((value) => value.trim()))];
  if (capabilities.length === 0) throw new Error("At least one capability is required");
  const invalid = capabilities.filter((value) => !isOperatorCapability(value));
  if (invalid.length > 0) throw new Error(`Unknown capability: ${invalid.join(", ")}`);
  if (!Number.isInteger(input.nowMs) || input.nowMs <= 0) throw new Error("nowMs must be a positive integer");
  const note = input.note?.trim() ? input.note.trim() : null;
  if (note && (note.length > MAX_NOTE || /[\r\n]/.test(note))) throw new Error(`note must be one line of at most ${MAX_NOTE} characters`);

  const json = quoteText(JSON.stringify(capabilities as OperatorCapability[]));
  return (
    "INSERT INTO platform_operators (user_id, capabilities, granted_by, note, created_at, revoked_at, updated_at) " +
    `VALUES (${quoteId(input.userId, "userId")}, ${json}, ${quoteId(input.grantedBy, "grantedBy")}, ` +
    `${note ? quoteText(note) : "NULL"}, ${input.nowMs}, NULL, ${input.nowMs}) ` +
    "ON CONFLICT (user_id) DO UPDATE SET capabilities = excluded.capabilities, granted_by = excluded.granted_by, " +
    "note = coalesce(excluded.note, platform_operators.note), revoked_at = NULL, updated_at = excluded.updated_at;"
  );
}
