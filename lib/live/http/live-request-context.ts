/**
 * Request plumbing shared by the Live member and operator routes: caller → policy subject, the
 * `LIVE_ENABLED` gate, same-site protection for cookie writes, bounded JSON bodies and optional
 * `Idempotency-Key` replay.
 */
import { resolveCaller, type ResolvedCaller } from "@/lib/auth-api-key";
import type { McpDelegationContext } from "@/lib/auth-mcp-delegation";
import type { AppDb } from "@/lib/db";
import { subjectFromCaller } from "@/lib/access/authorize";
import type { AccessSubject } from "@/lib/access/types";
import { BuilderApiError, assertSameSite, isSafeMethod } from "@/lib/builder-league/http";
import { withIdempotency } from "@/lib/blog/blog-idempotency";
import { isLiveEnabled } from "@/lib/live/live-flag";

export type LiveDelegationScope = McpDelegationContext["scope"];

export interface LiveRequestCaller {
  caller: ResolvedCaller | null;
  subject: AccessSubject;
}

/**
 * Resolves the caller and builds its policy subject. An MCP delegation is only accepted when its
 * assertion was signed for `scope` (checked by `resolveCaller`), so that scope is exactly what the
 * subject carries. Session writes must come from this site: cookies ride along on cross-site requests.
 */
export async function resolveLiveSubject(request: Request, db: AppDb, scope: LiveDelegationScope): Promise<LiveRequestCaller> {
  const caller = await resolveCaller(request.headers, db, {
    scope,
    method: request.method,
    path: new URL(request.url).pathname,
  });
  const subject = subjectFromCaller(caller, caller?.authType === "delegation" ? { scopes: [scope] } : {});
  if (caller?.authType === "session" && !isSafeMethod(request.method)) assertSameSite(request);
  return { caller, subject };
}

/** Member routes read with `mcp:read` and write with `mcp:write` delegations. */
export function memberDelegationScope(request: Request): LiveDelegationScope {
  return isSafeMethod(request.method) ? "mcp:read" : "mcp:write";
}

/** Member APIs answer 404 while `LIVE_ENABLED` is off, so the feature does not leak. */
export function assertLiveEnabled(): void {
  if (!isLiveEnabled()) throw new BuilderApiError(404, "not_found", "Not found");
}

/** A path segment used as an id or slug: 1-200 characters, otherwise a 400. */
export function requirePathParam(value: string | undefined, name: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed.length > 200) throw new BuilderApiError(400, "invalid_input", `${name} is invalid`);
  return trimmed;
}

const MAX_JSON_BYTES = 32 * 1024;

export interface JsonBody {
  /** Raw text, used for Idempotency-Key request hashing. */
  text: string;
  body: Record<string, unknown>;
}

/** Reads a JSON object body (max 32 KB). An empty body is `{}`; anything else that is not an object is a 400. */
export async function readJsonObject(request: Request): Promise<JsonBody> {
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new BuilderApiError(413, "payload_too_large", "Request body is too large");
  if (!text.trim()) return { text, body: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BuilderApiError(400, "invalid_json", "Request body must be JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BuilderApiError(400, "invalid_json", "Request body must be a JSON object");
  }
  return { text, body: parsed as Record<string, unknown> };
}

/**
 * Optional `Idempotency-Key` (stored per caller for 24 hours, see lib/blog/blog-idempotency.ts): a retry
 * with the same key and body replays the first response instead of running the write again.
 */
export function withLiveIdempotency(
  request: Request,
  db: AppDb,
  callerId: string,
  bodyText: string,
  run: () => Promise<Response>
): Promise<Response> {
  return withIdempotency(
    {
      db,
      key: request.headers.get("idempotency-key"),
      callerId,
      method: request.method,
      path: new URL(request.url).pathname,
      bodyText,
    },
    run
  );
}
