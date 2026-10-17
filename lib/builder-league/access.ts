/**
 * Who may use the Builder League.
 *
 * - `BUILDER_LEAGUE_ENABLED` (wrangler var) is "false" in production and "true" on staging.
 * - Flag off: only admins and paid members on the pilot allowlist (`builder_pilot_members`).
 * - Flag on: admins and every paid member (`getCommunityTier(...) !== "none"`).
 * - Everyone else gets a 404 while the flag is off, so the feature does not leak; with the flag on,
 *   signed-out callers get 401 and signed-in non-members 403.
 * Membership tier only gates access; it never changes RP, rank or League Score.
 */
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { builderPilotMembers } from "@/lib/db/schema";
import { resolveCaller, type ResolvedCaller } from "@/lib/auth-api-key";
import type { McpDelegationContext } from "@/lib/auth-mcp-delegation";
import { getCommunityTier } from "./membership";
import { BuilderApiError, fail } from "./http";
import type { ActorRole, CommunityTier } from "./types";

function getBinding(name: string): string | undefined {
  try {
    return (getCloudflareContext().env as unknown as Record<string, string>)[name];
  } catch {
    return process.env[name];
  }
}

export function isBuilderLeagueEnabled(): boolean {
  return getBinding("BUILDER_LEAGUE_ENABLED") === "true";
}

export interface BuilderViewer {
  id: string;
  role?: string | null;
}

export interface ViewerAccess {
  canUse: boolean;
  isAdmin: boolean;
  isPilot: boolean;
  tier: CommunityTier;
  flagEnabled: boolean;
}

export async function getViewerAccess(db: AppDb, user: BuilderViewer | null): Promise<ViewerAccess> {
  const flagEnabled = isBuilderLeagueEnabled();
  if (!user) return { canUse: false, isAdmin: false, isPilot: false, tier: "none", flagEnabled };
  const isAdmin = user.role === "admin";
  const [pilot] = await db
    .select({ userId: builderPilotMembers.userId })
    .from(builderPilotMembers)
    .where(eq(builderPilotMembers.userId, user.id))
    .limit(1);
  const isPilot = Boolean(pilot);
  const tier = await getCommunityTier(db, user.id);
  const canUse = isAdmin || (tier !== "none" && (flagEnabled || isPilot));
  return { canUse, isAdmin, isPilot, tier, flagEnabled };
}

/** API scopes of the Builder League. MCP delegation carries them as `mcp:read` / `mcp:write`. */
export type BuilderScope = "builder:read" | "builder:write";

const DELEGATION_SCOPE: Record<BuilderScope, McpDelegationContext["scope"]> = {
  "builder:read": "mcp:read",
  "builder:write": "mcp:write",
};

export interface BuilderCaller {
  caller: ResolvedCaller;
  access: ViewerAccess;
  /** `api` for API keys and `agent` for MCP delegation: both may only submit, never verify or award. */
  actorRole: ActorRole;
}

function actorRoleFor(caller: ResolvedCaller, isAdmin: boolean): ActorRole {
  if (caller.authType === "api_key") return "api";
  if (caller.authType === "delegation") return "agent";
  return isAdmin ? "admin" : "member";
}

/** 404 while the flag hides the feature, otherwise the given status. */
function denied(flagEnabled: boolean, status: 401 | 403, code: string): BuilderApiError {
  return flagEnabled ? new BuilderApiError(status, code, status === 401 ? "Sign in required" : "Builder League membership required") : notFoundError();
}

function notFoundError(): BuilderApiError {
  return new BuilderApiError(404, "not_found", "Not found");
}

/**
 * Resolves the caller (session, API key or MCP delegation) and checks Builder League access.
 * Throws `BuilderApiError`; wrap the route in `withBuilderErrors`.
 */
export async function requireBuilderLeagueUser(
  request: Request,
  scope: BuilderScope = "builder:read",
  db: AppDb = getDb()
): Promise<BuilderCaller> {
  const caller = await resolveCaller(request.headers, db, {
    scope: DELEGATION_SCOPE[scope],
    method: request.method,
    path: new URL(request.url).pathname,
  });
  const flagEnabled = isBuilderLeagueEnabled();
  if (!caller?.user) throw denied(flagEnabled, 401, "unauthorized");
  const access = await getViewerAccess(db, { id: caller.user.id, role: caller.user.role });
  if (!access.canUse) throw denied(flagEnabled, 403, "membership_required");
  return { caller, access, actorRole: actorRoleFor(caller, access.isAdmin) };
}

/** Admin routes need a signed-in session with `role = admin`; API keys and agents are refused. */
export async function requireBuilderLeagueAdmin(request: Request, db: AppDb = getDb()): Promise<BuilderCaller> {
  const caller = await resolveCaller(request.headers, db, {
    scope: "mcp:write",
    method: request.method,
    path: new URL(request.url).pathname,
  });
  const flagEnabled = isBuilderLeagueEnabled();
  if (!caller?.user) throw denied(flagEnabled, 401, "unauthorized");
  if (caller.user.role !== "admin") throw denied(flagEnabled, 403, "admin_required");
  if (caller.authType !== "session") throw new BuilderApiError(403, "session_required", "Admin actions require a signed-in session.");
  const access = await getViewerAccess(db, { id: caller.user.id, role: caller.user.role });
  return { caller, access, actorRole: "admin" };
}

/** The 404 JSON every hidden Builder League API route returns. */
export function builderNotFound(): NextResponse {
  return fail(404, "not_found");
}
