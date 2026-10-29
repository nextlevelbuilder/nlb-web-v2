/**
 * Auth for machine callers that act for an admin: the video renderer and the Discord ingestion bot.
 * Accepts an admin's session, or an admin's API key bound to the route's narrow scope
 * (`builder:render` or `builder:ingest`). Full API keys, keys with another scope, MCP delegation and
 * non-admin callers are refused.
 *
 * Kept apart from the queue and cron modules so the Worker's scheduled entry does not bundle the auth
 * stack (Better Auth) it never uses.
 */
import { resolveCaller, type ApiKeyScope } from "@/lib/auth-api-key";
import type { AppDb } from "@/lib/db";
import { BuilderApiError } from "./http";

/** Returns the admin user id, or throws 401/403 as a `BuilderApiError`. */
export async function requireAdminSessionOrScopedKey(request: Request, db: AppDb, scope: ApiKeyScope): Promise<string> {
  const caller = await resolveCaller(
    request.headers,
    db,
    { scope: "mcp:write", method: request.method, path: new URL(request.url).pathname },
    { apiKeyScope: scope },
  );
  if (!caller?.user) throw new BuilderApiError(401, "unauthorized", `Sign in as an admin or send an admin API key with the ${scope} scope.`);
  if (caller.authType === "delegation" || caller.user.role !== "admin") throw new BuilderApiError(403, "admin_required", "Admin access required.");
  if (caller.authType === "api_key" && !caller.apiKeyScopes?.includes(scope)) {
    throw new BuilderApiError(403, "scope_required", `This route needs an API key with the ${scope} scope; full API keys are refused.`);
  }
  return caller.user.id;
}

/**
 * Renderer endpoints (`NLB_RENDER_API_KEY` in the GitHub workflow): an admin session or an admin API key
 * with the `builder:render` scope. Returns the admin user id.
 */
export function requireRenderer(request: Request, db: AppDb): Promise<string> {
  return requireAdminSessionOrScopedKey(request, db, "builder:render");
}

/** Discord ingestion without the shared secret: an admin session or an admin API key with `builder:ingest`. */
export function requireIngester(request: Request, db: AppDb): Promise<string> {
  return requireAdminSessionOrScopedKey(request, db, "builder:ingest");
}
