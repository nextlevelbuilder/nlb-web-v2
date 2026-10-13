/**
 * Steps 3-5: back up the target D1, import the generated script, verify, and the post-import re-key.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DUMP_DIR, IMPORT_SQL, d1Query, timestampSlug, wrangler, type Target } from "./migration-environment";
import { readManifest, readRows, migratedTables } from "./convert-to-sql";
import { loadCatalog } from "./table-catalog";
import { rowIdentity } from "./value-converters";

/** Export the current target database before any write (kept next to the Neon dump). */
export function backupTarget(target: Target): string {
  const dir = path.join(DUMP_DIR, "backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `d1-${target}-${timestampSlug()}.sql`);
  wrangler(["d1", "export", "DB", "--output", file], target);
  console.log(`backup: ${path.relative(process.cwd(), file)}`);
  return file;
}

export function importSnapshot(target: Target): void {
  if (!existsSync(IMPORT_SQL)) throw new Error("import.sql missing; run the convert step first");
  if (target === "local") wrangler(["d1", "migrations", "apply", "DB"], target);
  backupTarget(target);
  wrangler(["d1", "execute", "DB", "--yes", "--file", IMPORT_SQL], target, { capture: false });
}

export interface TableVerification {
  table: string;
  sourceRows: number;
  targetRows: number;
  sourceHash: string;
  targetHash: string;
  ok: boolean;
}

const hashIdentities = (ids: string[]) => createHash("sha256").update([...ids].sort().join("\n")).digest("hex");

/** Compare row counts and a hash of sorted primary-key identities for every migrated table. */
export function verifyTarget(target: Target): TableVerification[] {
  const manifest = readManifest();
  const tables = migratedTables(manifest, loadCatalog());
  const results = tables.map((table) => {
    const source = readRows(table.name).map((row) => rowIdentity(row, table.primaryKey));
    const select = table.primaryKey.map((column) => `"${column}"`).join(", ");
    const target_ = d1Query(`SELECT ${select} FROM "${table.name}"`, target).map((row) => rowIdentity(row, table.primaryKey));
    const sourceHash = hashIdentities(source);
    const targetHash = hashIdentities(target_);
    return {
      table: table.name,
      sourceRows: source.length,
      targetRows: target_.length,
      sourceHash,
      targetHash,
      ok: source.length === target_.length && sourceHash === targetHash,
    };
  });
  const passed = results.filter((result) => result.ok).length;
  const report = {
    target,
    verifiedAt: new Date().toISOString(),
    snapshot: manifest.dumpedAt,
    passed,
    total: results.length,
    results,
  };
  const file = path.join(DUMP_DIR, `verify-${target}-${timestampSlug()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  for (const result of results) {
    console.log(`${result.ok ? "OK  " : "FAIL"} ${result.table.padEnd(28)} ${result.sourceRows} -> ${result.targetRows}  ${result.targetHash.slice(0, 12)}`);
  }
  console.log(`verify ${target}: ${passed}/${results.length} tables match (report ${path.basename(file)})`);
  return results;
}

/**
 * The JWKS private key in Neon is encrypted with the old BETTER_AUTH_SECRET, which was lost.
 * Clearing jwks_keys lets Better Auth generate a fresh signing key on first use.
 */
export function rekeyJwks(target: Target): void {
  wrangler(["d1", "execute", "DB", "--command", 'DELETE FROM "jwks_keys";'], target);
  console.log(`jwks_keys cleared on ${target}; Better Auth will mint a new key`);
}
