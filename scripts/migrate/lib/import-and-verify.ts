/**
 * Steps 3-5: back up the target D1, import the generated script, verify, and the post-import re-key.
 *
 * Every command that writes to D1 exports a backup first and aborts if that export fails.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DUMP_DIR, d1Query, timestampSlug, wrangler, type Target } from "./migration-environment";
import { assertImportScriptHeader, importScriptFor, migratedTables, readManifest, readRows } from "./convert-to-sql";
import type { ImportMode, VerifyMode } from "./import-mode";
import { loadCatalog, type CatalogTable } from "./table-catalog";
import { compareTable, type TableVerification } from "./verify-table-comparison";

/** Rows fetched per D1 query during verify (keeps each wrangler JSON response small). */
const VERIFY_PAGE_SIZE = 1000;

/** Export the current target database before any write (kept next to the Neon dump). Throws on failure. */
export function backupTarget(target: Target): string {
  const dir = path.join(DUMP_DIR, "backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `d1-${target}-${timestampSlug()}.sql`);
  try {
    wrangler(["d1", "export", "DB", "--output", file], target);
  } catch (error) {
    throw new Error(`D1 backup of ${target} failed, nothing was written: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`D1 backup of ${target} produced no file, nothing was written`);
  console.log(`backup: ${path.relative(process.cwd(), file)}`);
  return file;
}

function firstLine(file: string): string {
  const text = readFileSync(file, "utf8");
  const end = text.indexOf("\n");
  return end < 0 ? text : text.slice(0, end);
}

export function importSnapshot(target: Target, mode: ImportMode): void {
  const file = importScriptFor(mode);
  if (!existsSync(file)) throw new Error(`${path.basename(file)} missing; run the convert step first`);
  assertImportScriptHeader(firstLine(file), mode, readManifest().dumpedAt);
  backupTarget(target);
  if (target === "local") wrangler(["d1", "migrations", "apply", "DB"], target);
  console.log(`importing ${path.basename(file)} (${mode}) into ${target}`);
  wrangler(["d1", "execute", "DB", "--yes", "--file", file], target, { capture: false });
}

/** `SELECT *` of a whole table ordered by primary key, paged so large tables stay within output limits. */
function selectAllRows(table: CatalogTable, target: Target): Record<string, unknown>[] {
  const orderBy = table.primaryKey.map((column) => `"${column}"`).join(", ");
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += VERIFY_PAGE_SIZE) {
    const page = d1Query(`SELECT * FROM "${table.name}" ORDER BY ${orderBy} LIMIT ${VERIFY_PAGE_SIZE} OFFSET ${offset}`, target);
    rows.push(...page);
    if (page.length < VERIFY_PAGE_SIZE) return rows;
  }
}

/**
 * Compare every migrated table: row count, primary-key identity hash and type-normalised full-row hash.
 * In final-sync mode, D1-only rows are reported as information and do not fail the table.
 */
export function verifyTarget(target: Target, mode: VerifyMode): TableVerification[] {
  const manifest = readManifest();
  const tables = migratedTables(manifest, loadCatalog());
  const results = tables.map((table) =>
    compareTable(table, manifest.tables[table.name].columns, readRows(table.name), selectAllRows(table, target), mode)
  );
  const failed = results.filter((result) => !result.ok);
  const report = {
    target,
    mode,
    verifiedAt: new Date().toISOString(),
    snapshot: manifest.dumpedAt,
    passed: results.length - failed.length,
    total: results.length,
    failedTables: failed.map((result) => result.table),
    rowCountMismatchTables: results.filter((result) => !result.rowCountOk).map((result) => result.table),
    identityMismatchTables: results.filter((result) => !result.identityOk).map((result) => result.table),
    valueMismatchTables: results.filter((result) => !result.valuesOk).map((result) => result.table),
    extraTargetRows: Object.fromEntries(results.filter((result) => result.extraTargetRows > 0).map((result) => [result.table, result.extraTargetRows])),
    results,
  };
  const file = path.join(DUMP_DIR, `verify-${target}-${timestampSlug()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  for (const result of results) {
    const extra = result.extraTargetRows ? `  (+${result.extraTargetRows} D1-only${mode === "final-sync" ? ", info" : ""})` : "";
    const values = result.valuesOk ? "" : "  VALUES DIFFER";
    console.log(
      `${result.ok ? "OK  " : "FAIL"} ${result.table.padEnd(28)} ${result.sourceRows} -> ${result.comparedTargetRows}  ${result.targetValueHash.slice(0, 12)}${values}${extra}`
    );
  }
  console.log(`verify ${target} (${mode}): ${report.passed}/${results.length} tables match (report ${path.basename(file)})`);
  return results;
}

/**
 * The JWKS private key in Neon is encrypted with the old BETTER_AUTH_SECRET, which was lost.
 * Clearing jwks_keys lets Better Auth generate a fresh signing key on first use.
 */
export function rekeyJwks(target: Target): void {
  backupTarget(target);
  wrangler(["d1", "execute", "DB", "--command", 'DELETE FROM "jwks_keys";'], target);
  console.log(`jwks_keys cleared on ${target}; Better Auth will mint a new key`);
}
