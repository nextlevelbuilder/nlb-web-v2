/**
 * Viewer resolution for the Journey, Year in Review and Wrapped surfaces.
 *
 * Private pages (journey, own year) follow `getViewerAccess`. Public pages (Community Wrapped and shared
 * Year in Review links) are open to everyone while `BUILDER_LEAGUE_ENABLED` is on; while it is off they
 * 404 for everyone except admins and paid pilot members, like every other Builder League surface.
 */
import { eq } from "drizzle-orm";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb, type AppDb } from "@/lib/db";
import { builderPrivacy, users } from "@/lib/db/schema";
import { getViewerAccess, isBuilderLeagueEnabled, type ViewerAccess } from "./access";
import { BuilderApiError } from "./http";
import { resolveShareToken } from "./share-links";
import { getLatestYearSnapshot, snapshotData, toPublicYearReview, type PublicYearReview } from "./year-review";

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

/**
 * Gate for a member's own pages. While the league is hidden, anyone without access gets a 404 (nothing
 * leaks); with the flag on, signed-out visitors are sent to sign in and non-members get a 404.
 */
export async function requirePrivatePageViewer(locale: string, path: string, db: AppDb = getDb()): Promise<{ id: string; name: string }> {
  const { user, access } = await getPageViewer(db);
  const [{ notFound, redirect }, { getPathname }] = await Promise.all([import("next/navigation"), import("@/i18n/navigation")]);
  if (user && access.canUse) return user;
  if (!user && access.flagEnabled) {
    return redirect(getPathname({ href: { pathname: "/sign-in", query: { callbackUrl: getPathname({ href: path, locale }) } }, locale }));
  }
  return notFound();
}

/**
 * Public Builder League pages are visible to everyone when the flag is on; while it is off, only to
 * viewers who may use the league (admins, and pilot members with a paid tier), as `canUse` decides.
 */
export function canSeePublicSurface(access: ViewerAccess): boolean {
  return access.flagEnabled || access.canUse;
}

/** API guard for public, unauthenticated Builder League routes; throws a 404 while hidden. */
export async function requirePublicBuilderSurface(request: Request, db: AppDb = getDb()): Promise<void> {
  if (isBuilderLeagueEnabled()) return;
  const caller = await resolveCaller(request.headers, db, { scope: "mcp:read", method: request.method, path: new URL(request.url).pathname });
  const access = await getViewerAccess(db, caller?.user ? { id: caller.user.id, role: caller.user.role } : null);
  if (!canSeePublicSurface(access)) throw new BuilderApiError(404, "not_found", "Not found");
}

export interface SharedYearView {
  shareLinkId: string;
  ownerName: string;
  /** The owner opted in to a public, indexable Year in Review (`builder_privacy.wrapped_public`). */
  indexable: boolean;
  review: PublicYearReview;
}

/**
 * The public, redacted Year in Review behind a share token, or null when the token is unknown,
 * revoked, for another year, or the owner has no snapshot. Never returns private data.
 */
export async function loadSharedYear(db: AppDb, token: string, year: number): Promise<SharedYearView | null> {
  const link = await resolveShareToken(db, token, { kind: "year_review", year });
  if (!link) return null;
  const snapshot = await getLatestYearSnapshot(db, link.userId, year);
  if (!snapshot) return null;
  const [[owner], [privacy]] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, link.userId)).limit(1),
    db.select({ wrappedPublic: builderPrivacy.wrappedPublic }).from(builderPrivacy).where(eq(builderPrivacy.userId, link.userId)).limit(1),
  ]);
  return {
    shareLinkId: link.id,
    ownerName: owner?.name ?? "",
    indexable: Boolean(privacy?.wrappedPublic),
    review: toPublicYearReview(snapshotData(snapshot), snapshot.hiddenScenes),
  };
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
