/**
 * Request plumbing for the evidence and moderation routes. Every write route accepts JSON (API, CLI,
 * MCP) and plain HTML form posts, so the member and moderator pages work without JavaScript:
 * - a form post (urlencoded or multipart, without `Accept: application/json`) gets a 303 redirect to its
 *   validated same-site `returnTo` path with `?notice=` or `?error=` instead of a JSON body;
 * - cross-site form posts are refused (Origin / Sec-Fetch-Site), on top of the session cookie's SameSite.
 */
import { NextResponse } from "next/server";
import { BuilderApiError, builderErrorResponse } from "./http";

/** Multipart bodies carry up to five 10 MB files plus fields. */
const MAX_MULTIPART_BYTES = 52 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024;

export interface RequestInput {
  kind: "json" | "form";
  /** True for a browser form submission that expects a redirect. */
  redirect: boolean;
  body: Record<string, unknown>;
  files: File[];
  returnTo: string | null;
}

function contentType(request: Request): string {
  return (request.headers.get("content-type") ?? "").toLowerCase();
}

function isFormContent(request: Request): boolean {
  const type = contentType(request);
  return type.startsWith("multipart/form-data") || type.startsWith("application/x-www-form-urlencoded");
}

function wantsJson(request: Request): boolean {
  return (request.headers.get("accept") ?? "").toLowerCase().includes("application/json");
}

/** Same-site check for browser form posts; JSON requests are protected by CORS preflight. */
function assertSameSite(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site" && site !== "none") {
    throw new BuilderApiError(403, "cross_site_request", "Cross-site form submissions are not accepted.");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== "null" && origin !== new URL(request.url).origin) {
    throw new BuilderApiError(403, "cross_site_request", "Cross-site form submissions are not accepted.");
  }
}

/** Only relative, same-site paths into the Builder League or its admin pages. */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  if (!/^\/(vi\/)?(builder-league|studio\/builder-league)(\/|\?|$)/.test(value)) return null;
  if (value.includes("//") || value.includes("\\")) return null;
  return value;
}

/** `/vi` when a validated `returnTo` is a Vietnamese page, otherwise empty (English is unprefixed). */
export function localePrefixOf(returnTo: string | null): string {
  return returnTo?.startsWith("/vi/") ? "/vi" : "";
}

/** Fields that hold lists in forms: repeated inputs or one value per line. */
const LIST_FIELDS = new Set(["links", "reasonCodes", "removeFiles", "userIds"]);
/** Checkbox / select fields that carry booleans. */
const BOOLEAN_FIELDS = new Set(["dryRun"]);
/** Form-only fields never forwarded to services. */
const CONTROL_FIELDS = new Set(["returnTo", "files"]);

export function formToBody(form: FormData): { body: Record<string, unknown>; files: File[]; returnTo: string | null } {
  const body: Record<string, unknown> = {};
  const files: File[] = [];
  for (const [name, value] of form.entries()) {
    if (typeof value !== "string") {
      if (name === "files" && value.size > 0) files.push(value);
      continue;
    }
    if (CONTROL_FIELDS.has(name)) continue;
    if (LIST_FIELDS.has(name)) {
      const parts = value.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
      body[name] = [...((body[name] as string[] | undefined) ?? []), ...parts];
      continue;
    }
    if (BOOLEAN_FIELDS.has(name)) {
      body[name] = value === "true" || value === "on" || value === "1";
      continue;
    }
    if (value.trim() === "") continue;
    body[name] = value;
  }
  return { body, files, returnTo: safeReturnTo(form.get("returnTo")) };
}

/** Reads a JSON or form body with size limits. Bodiless requests read as `{}`. */
export async function readRequestInput(request: Request): Promise<RequestInput> {
  const declared = Number(request.headers.get("content-length"));
  if (isFormContent(request)) {
    if (Number.isFinite(declared) && declared > MAX_MULTIPART_BYTES) throw new BuilderApiError(413, "payload_too_large", "Request body is too large.");
    const redirect = !wantsJson(request);
    if (redirect) assertSameSite(request);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new BuilderApiError(400, "invalid_form", "The form data could not be read.");
    }
    const { body, files, returnTo } = formToBody(form);
    return { kind: "form", redirect, body, files, returnTo };
  }
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new BuilderApiError(413, "payload_too_large", "Request body is too large.");
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new BuilderApiError(413, "payload_too_large", "Request body is too large.");
  if (!text.trim()) return { kind: "json", redirect: false, body: {}, files: [], returnTo: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BuilderApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BuilderApiError(400, "invalid_json", "Request body must be a JSON object.");
  }
  return { kind: "json", redirect: false, body: parsed as Record<string, unknown>, files: [], returnTo: null };
}

/** 303 to `returnTo` (or the fallback) with notice/error query parameters. */
export function redirectWith(request: Request, returnTo: string | null, fallback: string, params: Record<string, string>): NextResponse {
  const url = new URL(returnTo ?? fallback, request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { status: 303, headers: { "cache-control": "no-store" } });
}

export interface WriteResult {
  response: NextResponse;
  /** Notice code for form submissions (e.g. `submitted`). */
  notice: string;
  /** Overrides `returnTo` for form submissions (e.g. the new evidence's page). */
  redirectTo?: string;
}

/**
 * Runs a write handler. JSON callers get the handler's response or the error envelope; form posts get
 * a redirect carrying `notice` or `error` (the error code), so the page can show a localized message.
 */
export async function handleWrite<Auth>(
  request: Request,
  fallbackReturnTo: string,
  authorize: () => Promise<Auth>,
  run: (input: RequestInput, auth: Auth) => Promise<WriteResult>
): Promise<Response> {
  let input: RequestInput | null = null;
  try {
    // Access first, so an unauthorised caller never gets a large body read or a revealing redirect.
    const auth = await authorize();
    input = await readRequestInput(request);
    const result = await run(input, auth);
    if (!input.redirect) return result.response;
    return redirectWith(request, result.redirectTo ?? input.returnTo, fallbackReturnTo, { notice: result.notice });
  } catch (err) {
    const response = builderErrorResponse(err);
    // Unreadable or cross-site bodies, missing access (401/404 keep a hidden feature hidden) and JSON
    // callers get the plain error envelope; browser forms get a redirect with the error code.
    if (!input?.redirect || response.status === 401 || response.status === 404) return response;
    const code = err instanceof BuilderApiError ? err.code : response.status === 400 ? "validation_failed" : "internal_error";
    return redirectWith(request, input.returnTo, fallbackReturnTo, { error: code });
  }
}
