/**
 * Pure per-table comparison of the Neon snapshot against D1 rows (unit tested).
 *
 * Three checks per table: row count, SHA-256 of sorted primary-key identities, and SHA-256 of
 * type-normalised full rows (see row-normalization.ts). Source rows go through the same conversion
 * rules as the import before normalisation, so a correct import always hashes identically.
 *
 * In `final-sync` mode D1 may hold rows created on v2 that the snapshot does not have. Only target
 * rows whose primary key is in the snapshot are compared; the rest are reported as `extraTargetRows`
 * (information, not failure).
 */
import { snapshotColumns } from "./convert-to-sql";
import type { VerifyMode } from "./import-mode";
import { hashSorted, serializeNormalizedRow } from "./row-normalization";
import type { CatalogTable } from "./table-catalog";
import { convertValue, rowIdentity } from "./value-converters";

/** How many offending primary keys to list per table in the report. */
const MAX_REPORTED_IDS = 5;

export interface TableVerification {
  table: string;
  mode: VerifyMode;
  sourceRows: number;
  /** All rows in the D1 table. */
  targetRows: number;
  /** D1 rows included in the comparison (all of them in exact mode; snapshot keys only in final-sync). */
  comparedTargetRows: number;
  /** D1-only rows whose key is not in the snapshot. A failure in exact mode, information in final-sync. */
  extraTargetRows: number;
  /** Snapshot rows with no D1 row of the same key. */
  missingTargetRows: number;
  sourceHash: string;
  targetHash: string;
  sourceValueHash: string;
  targetValueHash: string;
  rowCountOk: boolean;
  identityOk: boolean;
  valuesOk: boolean;
  ok: boolean;
  /** Up to five primary keys that are missing, extra (exact mode) or differ in value. */
  mismatchedIds: string[];
}

function serializeTargetRow(row: Record<string, unknown>, columns: Parameters<typeof serializeNormalizedRow>[1]): string {
  try {
    return serializeNormalizedRow(row, columns);
  } catch (error) {
    // A D1 value that cannot be normalised is itself a mismatch; report it instead of aborting verify.
    return `unnormalisable:${error instanceof Error ? error.message : String(error)}`;
  }
}

export function compareTable(
  table: CatalogTable,
  sourceColumnNames: readonly string[],
  sourceRows: readonly Record<string, unknown>[],
  targetRows: readonly Record<string, unknown>[],
  mode: VerifyMode
): TableVerification {
  const columns = snapshotColumns(table, sourceColumnNames);

  const source = new Map<string, string>();
  for (const row of sourceRows) {
    const converted: Record<string, unknown> = {};
    for (const column of columns) converted[column.name] = convertValue(row[column.name], column.kind);
    source.set(rowIdentity(row, table.primaryKey), serializeNormalizedRow(converted, columns));
  }

  const compared = new Map<string, string>();
  const extraIds: string[] = [];
  for (const row of targetRows) {
    const id = rowIdentity(row, table.primaryKey);
    if (mode === "final-sync" && !source.has(id)) {
      extraIds.push(id);
      continue;
    }
    if (!source.has(id)) extraIds.push(id);
    compared.set(id, serializeTargetRow(row, columns));
  }

  const missingIds = [...source.keys()].filter((id) => !compared.has(id));
  const changedIds = [...source.entries()].filter(([id, value]) => compared.has(id) && compared.get(id) !== value).map(([id]) => id);

  const sourceHash = hashSorted([...source.keys()]);
  const targetHash = hashSorted([...compared.keys()]);
  const sourceValueHash = hashSorted([...source.values()]);
  const targetValueHash = hashSorted([...compared.values()]);
  const rowCountOk = source.size === compared.size;
  const identityOk = sourceHash === targetHash;
  const valuesOk = sourceValueHash === targetValueHash;
  const unexpectedIds = mode === "exact" ? extraIds : [];

  return {
    table: table.name,
    mode,
    sourceRows: source.size,
    targetRows: targetRows.length,
    comparedTargetRows: compared.size,
    extraTargetRows: extraIds.length,
    missingTargetRows: missingIds.length,
    sourceHash,
    targetHash,
    sourceValueHash,
    targetValueHash,
    rowCountOk,
    identityOk,
    valuesOk,
    ok: rowCountOk && identityOk && valuesOk,
    mismatchedIds: [...missingIds, ...unexpectedIds, ...changedIds].sort().slice(0, MAX_REPORTED_IDS),
  };
}
