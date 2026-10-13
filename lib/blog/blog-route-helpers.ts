/**
 * Shared plumbing for app/api/v1/blog route handlers: admin auth, bounded JSON body reading,
 * idempotent writes and the `{ data }` envelope. Handlers stay a few lines each.
 */
import { NextResponse } from "next/server";
import { resolveCaller, type ResolvedCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { badRequest, blogErrorResponse, forbidden, payloadTooLarge, unauthorized } from "./blog-errors";
import { withIdempotency } from "./blog-idempotency";

/** Request bodies above this are rejected with 413 before parsing (blocks alone are capped at 200 KB). */
export const MAX_BODY_BYTES = 512 * 1024;

export type BlogScope = "mcp:read" | "mcp:write";

async function resolve(request: Request, scope: BlogScope): Promise<ResolvedCaller | null> {
  return resolveCaller(request.headers, undefined, { scope, method: request.method, path: new URL(request.url).pathname });
}

/** 401 without a caller, 403 unless the caller is an admin. */
export async function requireBlogAdmin(request: Request, scope: BlogScope): Promise<ResolvedCaller> {
  const caller = await resolve(request, scope);
  if (!caller?.user) throw unauthorized();
  if (caller.user.role !== "admin") throw forbidden();
  return caller;
}

/** True when the request carries admin credentials; never throws for anonymous callers. */
export async function isBlogAdmin(request: Request, scope: BlogScope): Promise<boolean> {
  const caller = await resolve(request, scope);
  return caller?.user?.role === "admin";
}

/** Reads the raw body with a size cap. */
export async function readBodyText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw payloadTooLarge("Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw payloadTooLarge("Request body is too large.");
  return text;
}

/** Parses a JSON body; an empty body is `{}` so bodiless endpoints accept no payload. */
export function parseJsonBody(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

export function dataResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: { "cache-control": "no-store" } });
}

/** Runs a read handler, converting thrown errors to the blog error envelope. */
export async function handleBlogRead(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    return blogErrorResponse(err);
  }
}

/**
 * Admin write pipeline: auth (mcp:write) → bounded body → Idempotency-Key handling → handler.
 * Handler errors become JSON responses inside the idempotency window, so 4xx outcomes replay too.
 */
export async function handleBlogWrite(
  request: Request,
  run: (ctx: { caller: ResolvedCaller; body: unknown }) => Promise<{ data: unknown; status?: number }>
): Promise<Response> {
  try {
    const caller = await requireBlogAdmin(request, "mcp:write");
    const bodyText = await readBodyText(request);
    const url = new URL(request.url);
    return await withIdempotency(
      {
        db: getDb(),
        key: request.headers.get("idempotency-key"),
        callerId: caller.user.id,
        method: request.method,
        path: `${url.pathname}${url.search}`,
        bodyText,
      },
      async () => {
        try {
          const result = await run({ caller, body: parseJsonBody(bodyText) });
          return dataResponse(result.data, result.status ?? 200);
        } catch (err) {
          return blogErrorResponse(err);
        }
      }
    );
  } catch (err) {
    return blogErrorResponse(err);
  }
}
