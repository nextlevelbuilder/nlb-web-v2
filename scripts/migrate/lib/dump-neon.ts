/**
 * Step 1: read-only snapshot of Neon.
 * - Full `pg_dump` (schema + data) kept as the backup of record.
 * - One NDJSON file per public table (`row_to_json`, one row per line) for conversion and verify.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { DUMP_DIR, MANIFEST, ROWS_DIR, ensureDumpDirs, neonUri, psql, psqlScript, readOnlyPgEnv, timestampSlug } from "./migration-environment";

export interface DumpManifest {
  dumpedAt: string;
  backupFile: string;
  tables: Record<string, { rows: number; columns: string[] }>;
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

export function dumpNeon(): DumpManifest {
  ensureDumpDirs();
  const dumpedAt = new Date();
  const backupFile = path.join(DUMP_DIR, `neon-${timestampSlug(dumpedAt)}.sql`);
  const backup = spawnSync("pg_dump", ["--no-owner", "--no-privileges", "--file", backupFile, neonUri()], {
    env: readOnlyPgEnv(),
    encoding: "utf8",
  });
  if (backup.status !== 0) throw new Error(`pg_dump failed: ${backup.stderr.trim()}`);
  console.log(`backup: ${path.relative(process.cwd(), backupFile)}`);

  const columnRows = psql(
    "select table_name, string_agg(column_name, ',' order by ordinal_position) from information_schema.columns " +
      "where table_schema = 'public' group by table_name order by table_name"
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  const tableColumns = columnRows.map((line) => {
    const [table, columns] = line.split("|");
    return { table, columns: columns.split(",") };
  });

  // One REPEATABLE READ, READ ONLY transaction so every table comes from the same snapshot.
  const marker = "@@NLB_TABLE ";
  const script = [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    ...tableColumns.flatMap(({ table }) => [`\\echo ${marker}${table}`, `select row_to_json(t) from public.${quoteIdent(table)} t;`]),
    "COMMIT;",
  ].join("\n");
  const output = psqlScript(script);

  const rowsByTable = new Map<string, string[]>(tableColumns.map(({ table }) => [table, []]));
  let current: string[] | undefined;
  for (const line of output.split("\n")) {
    if (line.startsWith(marker)) {
      current = rowsByTable.get(line.slice(marker.length).trim());
      continue;
    }
    if (!line || line === "BEGIN" || line === "COMMIT") continue;
    if (!current) throw new Error(`Unexpected psql output before first table marker: ${line.slice(0, 80)}`);
    // Parse every line once so a malformed dump fails here, not halfway through an import.
    JSON.parse(line);
    current.push(line);
  }

  const manifest: DumpManifest = { dumpedAt: dumpedAt.toISOString(), backupFile: path.basename(backupFile), tables: {} };
  for (const { table, columns } of tableColumns) {
    const lines = rowsByTable.get(table) ?? [];
    writeFileSync(path.join(ROWS_DIR, `${table}.ndjson`), lines.length ? `${lines.join("\n")}\n` : "");
    manifest.tables[table] = { rows: lines.length, columns };
    console.log(`dumped ${table}: ${lines.length}`);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  return manifest;
}
