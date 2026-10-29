import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { D1Result } from "@cloudflare/workers-types";
import type { AppDb } from "@/lib/db";

/**
 * Run raw parameterized statements as ONE D1 batch (D1's atomic unit: all or nothing, in order).
 * Drizzle's `db.batch` cannot take `db.run(sql\`…\`)` items that carry parameters, and the Live
 * seat/ticket writes need conditional `INSERT … SELECT` / `UPDATE … WHERE EXISTS` statements, so they
 * are compiled with the SQLite dialect and sent straight to the D1 binding.
 */
const dialect = new SQLiteSyncDialect();

export async function runRawBatch(db: AppDb, statements: SQL[]): Promise<D1Result[]> {
  if (statements.length === 0) return [];
  // drizzle's `drizzle()` attaches the binding as `$client`; `AppDb` is typed without it.
  const client = (db as unknown as { $client?: D1Database }).$client;
  if (!client) throw new Error("D1 binding is not reachable from the database client");
  const prepared = statements.map((statement) => {
    const query = dialect.sqlToQuery(statement);
    return client.prepare(query.sql).bind(...query.params);
  });
  return client.batch(prepared);
}

/** `meta.changes` of one batch result (rows written by that statement). */
export function changesOf(result: D1Result | undefined): number {
  return result?.meta?.changes ?? 0;
}
