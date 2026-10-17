import type { ZodType } from "zod";

/**
 * Stale-while-error cache for the /courses sidebar feeds.
 *
 * Order of lookup: module memory (per isolate / Node process), then the Workers Cache API
 * (`caches.default`, per colo). An entry younger than `ttlMs` is served as is. Otherwise the loader
 * runs; on success the parsed value is stored in both layers, on failure the last stored value is
 * served (stale) and, when there is none, `null` so the caller renders its fallback block.
 *
 * Stored payloads are re-validated with the caller's zod schema on read, so a corrupt or outdated
 * entry is ignored instead of reaching the page.
 */

/** Synthetic origin for cache keys: never fetched, only used to address `caches.default` entries. */
export const SIDEBAR_CACHE_ORIGIN = "https://cache.nextlevelbuilder.internal/sidebar/";
export const SIDEBAR_FRESH_TTL_MS = 6 * 60 * 60 * 1000;
/** How long an entry stays in the edge cache so it can still be served stale when a source is down. */
const EDGE_RETENTION_SECONDS = 7 * 24 * 60 * 60;

interface CacheEntry<T> {
  storedAt: number;
  value: T;
}

export interface CachedLoadOptions<T> {
  /** Last path segment of the synthetic key, e.g. `200lab-courses-v1`. */
  key: string;
  schema: ZodType<T>;
  load: () => Promise<T>;
  ttlMs?: number;
  now?: () => number;
}

const memory = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Workers exposes `caches.default`; Node and the browser do not, so guard before touching it. */
function edgeCache(): Cache | null {
  if (typeof caches === "undefined" || !("default" in caches)) return null;
  return (caches as CacheStorage & { default: Cache }).default;
}

function parseEntry<T>(raw: unknown, schema: ZodType<T>): CacheEntry<T> | null {
  if (!raw || typeof raw !== "object") return null;
  const { storedAt, value } = raw as { storedAt?: unknown; value?: unknown };
  if (typeof storedAt !== "number" || !Number.isFinite(storedAt)) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? { storedAt, value: parsed.data } : null;
}

async function readEdge<T>(cacheKey: string, schema: ZodType<T>): Promise<CacheEntry<T> | null> {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(cacheKey);
    return hit ? parseEntry(await hit.json(), schema) : null;
  } catch (error) {
    console.error(`[courses-sidebar] cache read failed for ${cacheKey}:`, error);
    return null;
  }
}

async function writeEdge<T>(cacheKey: string, entry: CacheEntry<T>): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  try {
    const body = JSON.stringify(entry);
    await cache.put(cacheKey, new Response(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${EDGE_RETENTION_SECONDS}` },
    }));
  } catch (error) {
    console.error(`[courses-sidebar] cache write failed for ${cacheKey}:`, error);
  }
}

async function readEntry<T>(cacheKey: string, schema: ZodType<T>): Promise<CacheEntry<T> | null> {
  const local = parseEntry(memory.get(cacheKey), schema);
  const edge = await readEdge(cacheKey, schema);
  if (local && edge) return local.storedAt >= edge.storedAt ? local : edge;
  return local ?? edge;
}

async function resolve<T>({ key, schema, load, ttlMs = SIDEBAR_FRESH_TTL_MS, now = Date.now }: CachedLoadOptions<T>): Promise<T | null> {
  const cacheKey = `${SIDEBAR_CACHE_ORIGIN}${key}`;
  const existing = await readEntry(cacheKey, schema);
  if (existing && now() - existing.storedAt < ttlMs) return existing.value;

  try {
    const value = schema.parse(await load());
    const entry: CacheEntry<T> = { storedAt: now(), value };
    memory.set(cacheKey, entry);
    await writeEdge(cacheKey, entry);
    return value;
  } catch (error) {
    console.error(`[courses-sidebar] refresh failed for ${key}; serving ${existing ? "stale cache" : "fallback"}:`, error);
    return existing?.value ?? null;
  }
}

/** Load a sidebar feed through the cache. Never throws; concurrent calls for one key share a refresh. */
export function cachedSidebarLoad<T>(options: CachedLoadOptions<T>): Promise<T | null> {
  const pending = inFlight.get(options.key) as Promise<T | null> | undefined;
  if (pending) return pending;
  const promise = resolve(options).finally(() => inFlight.delete(options.key));
  inFlight.set(options.key, promise);
  return promise;
}

/** Test hook: forget every in-memory entry. */
export function clearSidebarMemoryCache(): void {
  memory.clear();
  inFlight.clear();
}
