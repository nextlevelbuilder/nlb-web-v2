/**
 * Step 2: convert the NDJSON snapshot into SQLite scripts for D1, one per import mode.
 *
 * - `import-final-sync.sql` (cutover): upserts every snapshot row by primary key, parents first,
 *   and contains no DELETE, so rows that exist only in D1 survive.
 * - `import.sql` (full replace): deletes every migrated table (children first), then inserts
 *   parents first, so it converges to exactly the snapshot. Only for an empty/disposable target.
 *
 * Tables that exist only in v2 (blog, courses, idempotency, anything not in the snapshot) are never
 * touched by either script. Line 1 of each script records its mode and snapshot; import checks it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FINAL_SYNC_SQL, IMPORT_SQL, MANIFEST, ROWS_DIR } from "./migration-environment";
import type { DumpManifest } from "./dump-neon";
import type { ImportMode } from "./import-mode";
import { loadCatalog, type CatalogColumn, type CatalogTable } from "./table-catalog";
import { convertValue, sqlLiteral } from "./value-converters";

/** D1 caps a single statement at 100 KB; stay well below. */
const MAX_STATEMENT_BYTES = 90_000;
const MAX_ROWS_PER_STATEMENT = 200;

export interface ConvertResult {
  files: Record<ImportMode, string>;
  tables: string[];
  rows: number;
}

export function readManifest(): DumpManifest {
  return JSON.parse(readFileSync(MANIFEST, "utf8")) as DumpManifest;
}

export function readRows(table: string): Record<string, unknown>[] {
  return readFileSync(path.join(ROWS_DIR, `${table}.ndjson`), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function importScriptFor(mode: ImportMode): string {
  return mode === "final-sync" ? FINAL_SYNC_SQL : IMPORT_SQL;
}

/** Source tables must map 1:1 onto the D1 schema; unknown tables or columns abort (no silent data loss). */
export function migratedTables(manifest: DumpManifest, catalog: CatalogTable[]): CatalogTable[] {
  const byName = new Map(catalog.map((table) => [table.name, table]));
  const problems: string[] = [];
  for (const [name, info] of Object.entries(manifest.tables)) {
    const target = byName.get(name);
    if (!target) {
      problems.push(`source table ${name} has no D1 table`);
      continue;
    }
    const targetColumns = new Set(target.columns.map((column) => column.name));
    for (const column of info.columns) {
      if (!targetColumns.has(column)) problems.push(`${name}.${column} has no D1 column`);
    }
  }
  if (problems.length) throw new Error(`Schema mismatch:\n  ${problems.join("\n  ")}`);
  return catalog.filter((table) => table.name in manifest.tables);
}

/** D1 columns that the snapshot carries, in D1 column order (v2-only columns keep their defaults). */
export function snapshotColumns(table: CatalogTable, sourceColumns: readonly string[]): CatalogColumn[] {
  return table.columns.filter((column) => sourceColumns.includes(column.name));
}

const quote = (name: string) => `"${name}"`;

/** `ON CONFLICT (pk) DO UPDATE SET col = excluded.col` for every non-key column. */
export function upsertClause(table: CatalogTable, columns: readonly CatalogColumn[]): string {
  const missingKey = table.primaryKey.filter((key) => !columns.some((column) => column.name === key));
  if (missingKey.length) throw new Error(`${table.name}: primary key column(s) ${missingKey.join(", ")} missing from the snapshot`);
  const updates = columns.filter((column) => !table.primaryKey.includes(column.name));
  const target = table.primaryKey.map(quote).join(", ");
  if (!updates.length) return `ON CONFLICT (${target}) DO NOTHING`;
  return `ON CONFLICT (${target}) DO UPDATE SET ${updates.map((column) => `${quote(column.name)} = excluded.${quote(column.name)}`).join(", ")}`;
}

export function insertStatements(
  table: CatalogTable,
  rows: Record<string, unknown>[],
  sourceColumns: readonly string[],
  mode: ImportMode = "replace"
): string[] {
  const columns = snapshotColumns(table, sourceColumns);
  const head = `INSERT INTO ${quote(table.name)} (${columns.map((column) => quote(column.name)).join(", ")}) VALUES\n`;
  const tail = mode === "final-sync" ? `\n${upsertClause(table, columns)};` : ";";
  const bytes = (text: string) => Buffer.byteLength(text, "utf8");
  const overhead = bytes(head) + bytes(tail);
  const statements: string[] = [];
  let tuples: string[] = [];
  let size = overhead;
  const flush = () => {
    if (tuples.length) statements.push(`${head}${tuples.join(",\n")}${tail}`);
    tuples = [];
    size = overhead;
  };
  for (const row of rows) {
    let tuple: string;
    try {
      tuple = `(${columns.map((column) => sqlLiteral(convertValue(row[column.name], column.kind))).join(", ")})`;
    } catch (error) {
      const id = table.primaryKey.map((key) => String(row[key])).join("/");
      throw new Error(`${table.name} row ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const tupleBytes = bytes(tuple) + 2;
    if (overhead + tupleBytes > MAX_STATEMENT_BYTES) {
      throw new Error(`${table.name}: a single row exceeds the D1 statement size limit`);
    }
    if (size + tupleBytes > MAX_STATEMENT_BYTES || tuples.length >= MAX_ROWS_PER_STATEMENT) flush();
    tuples.push(tuple);
    size += tupleBytes;
  }
  flush();
  return statements;
}

/** Machine-readable first line of every generated script. */
export function importScriptHeader(mode: ImportMode, snapshot: string): string {
  return `-- nlb-migrate mode=${mode} snapshot=${snapshot}`;
}

/** Refuse to execute a script generated for another mode or an older snapshot. */
export function assertImportScriptHeader(firstLine: string, mode: ImportMode, snapshot: string): void {
  const match = /^-- nlb-migrate mode=(\S+) snapshot=(\S+)$/.exec(firstLine.trim());
  if (!match) throw new Error("Import script has no nlb-migrate header (generated by an older version); re-run the convert step");
  if (match[1] !== mode) throw new Error(`Import script was generated for mode ${match[1]}, not ${mode}; re-run the convert step`);
  if (match[2] !== snapshot) {
    throw new Error(`Import script is for snapshot ${match[2]} but manifest.json is ${snapshot}; re-run the convert step`);
  }
}

/** Build the full SQL script for one mode. Pure: rows are supplied by the caller. */
export function buildImportScript(
  manifest: DumpManifest,
  tables: readonly CatalogTable[],
  rowsFor: (table: string) => Record<string, unknown>[],
  mode: ImportMode,
  generatedAt = new Date()
): { sql: string; rows: number } {
  const lines: string[] = [
    importScriptHeader(mode, manifest.dumpedAt),
    `-- Neon -> D1 ${mode} import generated ${generatedAt.toISOString()}`,
    "PRAGMA defer_foreign_keys = true;",
  ];
  if (mode === "replace") {
    for (const table of [...tables].reverse()) lines.push(`DELETE FROM ${quote(table.name)};`);
  }
  let rows = 0;
  for (const table of tables) {
    const tableRows = rowsFor(table.name);
    rows += tableRows.length;
    lines.push(...insertStatements(table, tableRows, manifest.tables[table.name].columns, mode));
  }
  return { sql: `${lines.join("\n")}\n`, rows };
}

/** Write both the final-sync and the full-replace script from the current snapshot. */
export function convertSnapshot(): ConvertResult {
  const manifest = readManifest();
  const tables = migratedTables(manifest, loadCatalog());
  const rowsByTable = new Map(tables.map((table) => [table.name, readRows(table.name)]));
  const rowsFor = (name: string) => rowsByTable.get(name) ?? [];
  const generatedAt = new Date();
  let rows = 0;
  for (const mode of ["final-sync", "replace"] as const) {
    const script = buildImportScript(manifest, tables, rowsFor, mode, generatedAt);
    writeFileSync(importScriptFor(mode), script.sql);
    rows = script.rows;
    console.log(`wrote ${path.basename(importScriptFor(mode))} (${mode}): ${tables.length} tables, ${script.rows} rows`);
  }
  return {
    files: { "final-sync": FINAL_SYNC_SQL, replace: IMPORT_SQL },
    tables: tables.map((table) => table.name),
    rows,
  };
}
