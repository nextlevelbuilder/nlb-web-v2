/**
 * `Idempotency-Key` support for blog writes, stored in api_idempotency_keys per caller for 24 hours.
 * The first request claims the key (status_code 0), runs, and stores its response. A retry with the
 * same key and the same method/path/body replays the stored response; a different request under the
 * same key is a 422; a retry while the first is still running is a 409. 5xx responses and thrown
 * errors release the claim so the client can retry. Claims abandoned by a crashed isolate expire
 * after one minute.
 */
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { apiIdempotencyKeys } from "@/lib/db/schema";
import { BlogApiError, badRequest, conflict } from "./blog-errors";

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const ABANDONED_CLAIM_MS = 60 * 1000;
const KEY_RE = /^[\x21-\x7e]{1,128}$/;

export interface IdempotencyOptions {
  db: AppDb;
  key: string | null;
  callerId: string;
  method: string;
  path: string;
  bodyText: string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type StoredRow = typeof apiIdempotencyKeys.$inferSelect;

async function claim(opts: IdempotencyOptions, requestHash: string): Promise<boolean> {
  const inserted = await opts.db
    .insert(apiIdempotencyKeys)
    .values({ callerId: opts.callerId, key: opts.key!, method: opts.method, path: opts.path, requestHash, statusCode: 0, responseBody: "", createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ key: apiIdempotencyKeys.key });
  return inserted.length === 1;
}

function isExpired(row: StoredRow, now: number): boolean {
  const age = now - row.createdAt.getTime();
  return age > IDEMPOTENCY_TTL_MS || (row.statusCode === 0 && age > ABANDONED_CLAIM_MS);
}

const rowKey = (opts: IdempotencyOptions) => and(eq(apiIdempotencyKeys.callerId, opts.callerId), eq(apiIdempotencyKeys.key, opts.key!));

function replay(row: StoredRow): Response {
  return new Response(row.responseBody, {
    status: row.statusCode,
    headers: { "content-type": "application/json", "idempotency-replayed": "true", "cache-control": "no-store" },
  });
}

/** Runs `run` at most once per (caller, key) within 24 hours; see the module comment for semantics. */
export async function withIdempotency(opts: IdempotencyOptions, run: () => Promise<Response>): Promise<Response> {
  if (opts.key === null) return run();
  if (!KEY_RE.test(opts.key)) throw badRequest("Idempotency-Key must be 1-128 visible ASCII characters.");
  const requestHash = await sha256Hex(`${opts.method}\n${opts.path}\n${opts.bodyText}`);

  let claimed = await claim(opts, requestHash);
  if (!claimed) {
    const [existing] = await opts.db.select().from(apiIdempotencyKeys).where(rowKey(opts)).limit(1);
    if (existing && !isExpired(existing, Date.now())) {
      if (existing.requestHash !== requestHash) throw new BlogApiError(422, "Idempotency-Key was already used with a different request.");
      if (existing.statusCode === 0) throw conflict("A request with this Idempotency-Key is still being processed. Retry shortly.");
      return replay(existing);
    }
    if (existing) await opts.db.delete(apiIdempotencyKeys).where(and(rowKey(opts), eq(apiIdempotencyKeys.createdAt, existing.createdAt)));
    claimed = await claim(opts, requestHash);
    if (!claimed) throw conflict("A request with this Idempotency-Key is still being processed. Retry shortly.");
  }

  let response: Response;
  try {
    response = await run();
  } catch (err) {
    await opts.db.delete(apiIdempotencyKeys).where(rowKey(opts));
    throw err;
  }
  if (response.status >= 500) {
    await opts.db.delete(apiIdempotencyKeys).where(rowKey(opts));
    return response;
  }
  const body = await response.text();
  await opts.db.update(apiIdempotencyKeys).set({ statusCode: response.status, responseBody: body }).where(rowKey(opts));
  return new Response(body, { status: response.status, headers: response.headers });
}
