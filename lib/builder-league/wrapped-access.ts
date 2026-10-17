/**
 * Viewer resolution for the Journey, Year in Review and Wrapped surfaces.
 *
 * Private pages (journey, own year) follow `getViewerAccess`. Public pages (Community Wrapped and shared
 * Year in Review links) are open to everyone while `BUILDER_LEAGUE_ENABLED` is on; while it is off they
 * 404 for everyone except admins and pilot members, like every other Builder League surface.
 */
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb, type AppDb } from "@/lib/db";
import { getViewerAccess, isBuilderLeagueEnabled, type ViewerAccess } from "./access";
import { BuilderApiError } from "./http";

export interface PageViewer {
  user: { id: string; name: string; role?: string | null } | null;
  access: ViewerAccess;
}

/** The signed-in viewer of a server-rendered page and their Builder League access. */
export async function getPageViewer(db: AppDb = getDb()): Promise<PageViewer> {
  let user: PageViewer["user"] = null;
  try {
    const [{ headers }, { getAuth }] = await Promise.all([import("next/headers"), import("@/lib/auth")]);
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (session?.user) user = { id: session.user.id, name: session.user.name, role: (session.user as { role?: string | null }).role ?? null };
  } catch {
    user = null;
  }
  return { user, access: await getViewerAccess(db, user) };
}

/** Public Builder League pages are visible when the flag is on, or to admins and pilot members. */
export function canSeePublicSurface(access: ViewerAccess): boolean {
  return access.flagEnabled || access.isAdmin || access.isPilot;
}

/** API guard for public, unauthenticated Builder League routes; throws a 404 while hidden. */
export async function requirePublicBuilderSurface(request: Request, db: AppDb = getDb()): Promise<void> {
  if (isBuilderLeagueEnabled()) return;
  const caller = await resolveCaller(request.headers, db, { scope: "mcp:read", method: request.method, path: new URL(request.url).pathname });
  const access = await getViewerAccess(db, caller?.user ? { id: caller.user.id, role: caller.user.role } : null);
  if (!canSeePublicSurface(access)) throw new BuilderApiError(404, "not_found", "Not found");
}

/** Parses a `[year]` route segment (2000–9999) or throws a 404. */
export function parseYearParam(value: string): number {
  if (!/^\d{4}$/.test(value)) throw new BuilderApiError(404, "not_found", "Not found");
  const year = Number(value);
  if (year < 2000) throw new BuilderApiError(404, "not_found", "Not found");
  return year;
}

/** Years a member can open: from 2026 (the league's first year) to the current local year. */
export function isReviewableYear(year: number, currentYear: number): boolean {
  return year >= 2026 && year <= currentYear;
}
