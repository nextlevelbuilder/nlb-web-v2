import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { AsyncLocalStorage } from "async_hooks";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export type AppDb = DrizzleD1Database<typeof schema>;

/** Minimal shape of the Cloudflare env this module needs. */
export interface DbEnv {
  DB?: D1Database;
}

// Request-scoped storage for explicit database overrides (tests, scripts, queue consumers).
const dbContextStorage = new AsyncLocalStorage<AppDb>();

// One Drizzle wrapper per D1 binding object. Bindings are per-isolate, so this is safe to cache.
const clientCache = new WeakMap<D1Database, AppDb>();

/** Wrap a D1 binding in a typed Drizzle client. */
export function createDb(binding: D1Database): AppDb {
  const cached = clientCache.get(binding);
  if (cached) return cached;
  const db = drizzle(binding, { schema });
  clientCache.set(binding, db);
  return db;
}

/**
 * Resolve the database for the current request.
 * Order: explicit env object -> AsyncLocalStorage override -> OpenNext Cloudflare context.
 * Throws when no D1 binding is reachable so misconfiguration fails loudly instead of silently.
 */
export function getDb(env?: DbEnv): AppDb {
  if (env) {
    if (!env.DB) throw new Error("D1 binding `DB` is missing from Cloudflare environment context.");
    return createDb(env.DB);
  }

  const stored = dbContextStorage.getStore();
  if (stored) return stored;

  let cfEnv: DbEnv | undefined;
  try {
    cfEnv = getCloudflareContext().env as DbEnv;
  } catch {
    cfEnv = undefined;
  }
  if (cfEnv?.DB) return createDb(cfEnv.DB);

  // Vitest only: tests/setup/local-d1-setup.ts installs an in-memory Miniflare D1 as the default.
  const testDb = process.env.VITEST ? (globalThis as { __NLB_TEST_DB__?: AppDb }).__NLB_TEST_DB__ : undefined;
  if (testDb) return testDb;

  throw new Error(
    "D1 binding `DB` is unavailable. Run inside the Worker (wrangler/opennext preview or `next dev` with initOpenNextCloudflareForDev) or wrap the call in runWithDb()."
  );
}

/** Run a function with an explicit database instance bound to the async context. */
export function runWithDb<T>(dbInstance: AppDb, fn: () => T): T {
  return dbContextStorage.run(dbInstance, fn);
}

export { schema };
