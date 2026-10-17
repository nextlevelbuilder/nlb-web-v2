/**
 * Auth for machine callers that act for an admin: the video renderer and the Discord ingestion bot.
 * Accepts an admin's session or an admin's NLB API key; MCP delegation and non-admin keys are refused.
 *
 * Kept apart from the queue and cron modules so the Worker's scheduled entry does not bundle the auth
 * stack (Better Auth) it never uses.
 */
import { resolveCaller } from "@/lib/auth-api-key";
import type { AppDb } from "@/lib/db";
import { BuilderApiError } from "./http";

/** Returns the admin user id, or throws 401/403 as a `BuilderApiError`. */
export async function requireAdminSessionOrKey(request: Request, db: AppDb): Promise<string> {
  const caller = await resolveCaller(request.headers, db, { scope: "mcp:write", method: request.method, path: new URL(request.url).pathname });
  if (!caller?.user) throw new BuilderApiError(401, "unauthorized", "Sign in or send an admin API key.");
  if (caller.authType === "delegation" || caller.user.role !== "admin") throw new BuilderApiError(403, "admin_required", "Admin access required.");
  return caller.user.id;
}

/**
 * Renderer endpoints accept an admin's session or an admin's NLB API key (`NLB_RENDER_API_KEY` in the
 * GitHub workflow). Returns the admin user id.
 */
export const requireRenderer = requireAdminSessionOrKey;
