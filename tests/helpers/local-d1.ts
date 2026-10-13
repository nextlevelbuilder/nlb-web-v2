import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { createDb, type AppDb } from "@/lib/db";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../drizzle/migrations");

/** Split drizzle-kit migration files into single statements (D1 prepares one statement at a time). */
export function readMigrationStatements(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .flatMap((file) => readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint"))
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export interface LocalD1 {
  d1: D1Database;
  db: AppDb;
  dispose: () => Promise<void>;
}

/**
 * Start an in-memory Cloudflare D1 (the same workerd SQLite engine wrangler uses locally),
 * apply every migration and return a typed Drizzle client bound to it.
 */
export async function createLocalD1(): Promise<LocalD1> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: { DB: "test-db" },
  });
  const d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const statement of readMigrationStatements()) {
    await d1.prepare(statement).run();
  }
  return { d1, db: createDb(d1), dispose: () => mf.dispose() };
}
