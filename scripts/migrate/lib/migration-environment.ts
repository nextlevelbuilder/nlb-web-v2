/**
 * Paths, the read-only Neon connection, and the wrangler runner shared by the migration steps.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const DUMP_DIR = path.join(ROOT, "scripts/migrate/dump");
export const ROWS_DIR = path.join(DUMP_DIR, "rows");
export const IMPORT_SQL = path.join(DUMP_DIR, "import.sql");
export const MANIFEST = path.join(DUMP_DIR, "manifest.json");
export const ACCOUNT_ID = "7ac87c90789159ae1b10b7d78f5dcc08";

export type Target = "local" | "staging" | "production";

export function parseTarget(value: string | undefined): Target {
  if (value === "local" || value === "staging" || value === "production") return value;
  throw new Error(`--target must be local | staging | production (got ${value ?? "nothing"})`);
}

export function ensureDumpDirs(): void {
  mkdirSync(ROWS_DIR, { recursive: true });
}

/**
 * Neon connection string: NEON_DATABASE_URL env var, else scripts/migrate/dump/.neon-uri (gitignored).
 * Every session is forced read-only via PGOPTIONS so the migration can never write to Neon.
 */
export function neonUri(): string {
  const fromEnv = process.env.NEON_DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(DUMP_DIR, ".neon-uri");
  if (!existsSync(file)) throw new Error("Set NEON_DATABASE_URL or write scripts/migrate/dump/.neon-uri (chmod 600)");
  return readFileSync(file, "utf8").trim();
}

export function readOnlyPgEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=120000" };
}

/** Run psql read-only and return stdout (never logs the connection string). */
export function psql(sql: string): string {
  const result = spawnSync("psql", [neonUri(), "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: readOnlyPgEnv(),
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr.trim()}`);
  return result.stdout;
}

// Wrangler auto-loads CLOUDFLARE_API_TOKEN from ./.env, which lacks D1 permission; run it from a
// neutral directory with the token unset so the OAuth login (pinned to the hi@ account) is used.
// In CI, CLOUDFLARE_API_TOKEN is intentionally kept (set MIGRATE_KEEP_API_TOKEN=1).
const neutralDir = mkdtempSync(path.join(os.tmpdir(), "nlb-migrate-"));

export function wrangler(args: string[], target: Target, options: { capture?: boolean } = {}): string {
  const env: NodeJS.ProcessEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, CI: "1" };
  if (!process.env.MIGRATE_KEEP_API_TOKEN) delete env.CLOUDFLARE_API_TOKEN;
  // Local runs need no auth and use the project's default .wrangler/state, so they run from ROOT.
  const location = target === "local" ? ["--local"] : ["--remote"];
  const envFlag = target === "staging" ? ["--env", "staging"] : [];
  const fullArgs = ["--config", path.join(ROOT, "wrangler.jsonc"), ...args, ...location, ...envFlag];
  const bin = path.join(ROOT, "node_modules/.bin/wrangler");
  return execFileSync(bin, fullArgs, {
    cwd: target === "local" ? ROOT : neutralDir,
    env,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
  }) ?? "";
}

/** Run one read query on D1 and return its rows. */
export function d1Query<T = Record<string, unknown>>(sql: string, target: Target): T[] {
  const out = wrangler(["d1", "execute", "DB", "--json", "--command", sql], target);
  const parsed = JSON.parse(out.slice(out.indexOf("["))) as Array<{ results: T[]; success: boolean }>;
  if (!parsed[0]?.success) throw new Error(`D1 query failed: ${sql}`);
  return parsed[0].results;
}

/** Run a multi-statement psql script (stdin) read-only and return stdout. */
export function psqlScript(script: string): string {
  const result = spawnSync("psql", [neonUri(), "-X", "-At", "-q", "-v", "ON_ERROR_STOP=1"], {
    env: readOnlyPgEnv(),
    input: script,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr.trim()}`);
  return result.stdout;
}

export function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
