/**
 * Step 2: convert the NDJSON snapshot into one idempotent SQLite script for D1.
 *
 * The script first deletes every migrated table (children first), then inserts parents first,
 * so re-running it always converges to exactly the snapshot. Tables that exist only in v2
 * (blog, courses, idempotency) are never touched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { IMPORT_SQL, MANIFEST, ROWS_DIR } from "./migration-environment";
import type { DumpManifest } from "./dump-neon";
import { loadCatalog, type CatalogTable } from "./table-catalog";
import { convertValue, sqlLiteral } from "./value-converters";

/** D1 caps a single statement at 100 KB; stay well below. */
const MAX_STATEMENT_BYTES = 90_000;
const MAX_ROWS_PER_STATEMENT = 200;

export interface ConvertResult {
  file: string;
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

export function insertStatements(table: CatalogTable, rows: Record<string, unknown>[], sourceColumns: string[]): string[] {
  const columns = table.columns.filter((column) => sourceColumns.includes(column.name));
  const head = `INSERT INTO "${table.name}" (${columns.map((column) => `"${column.name}"`).join(", ")}) VALUES\n`;
  const statements: string[] = [];
  let tuples: string[] = [];
  const bytes = (text: string) => Buffer.byteLength(text, "utf8");
  let size = bytes(head);
  const flush = () => {
    if (tuples.length) statements.push(`${head}${tuples.join(",\n")};`);
    tuples = [];
    size = bytes(head);
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
    if (bytes(head) + tupleBytes > MAX_STATEMENT_BYTES) {
      throw new Error(`${table.name}: a single row exceeds the D1 statement size limit`);
    }
    if (size + tupleBytes > MAX_STATEMENT_BYTES || tuples.length >= MAX_ROWS_PER_STATEMENT) flush();
    tuples.push(tuple);
    size += tupleBytes;
  }
  flush();
  return statements;
}

export function convertSnapshot(): ConvertResult {
  const manifest = readManifest();
  const tables = migratedTables(manifest, loadCatalog());
  const lines: string[] = [
    `-- Neon -> D1 import generated ${new Date().toISOString()} from snapshot ${manifest.dumpedAt}`,
    "PRAGMA defer_foreign_keys = true;",
  ];
  for (const table of [...tables].reverse()) lines.push(`DELETE FROM "${table.name}";`);
  let rows = 0;
  for (const table of tables) {
    const tableRows = readRows(table.name);
    rows += tableRows.length;
    lines.push(...insertStatements(table, tableRows, manifest.tables[table.name].columns));
  }
  writeFileSync(IMPORT_SQL, `${lines.join("\n")}\n`);
  console.log(`wrote ${path.basename(IMPORT_SQL)}: ${tables.length} tables, ${rows} rows`);
  return { file: IMPORT_SQL, tables: tables.map((table) => table.name), rows };
}
