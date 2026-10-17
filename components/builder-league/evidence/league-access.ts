/**
 * Page-level access for the Builder League evidence and admin pages (server only). Mirrors the API:
 * while `BUILDER_LEAGUE_ENABLED` is off, anyone who is not an admin or a paid pilot member gets a 404,
 * so the feature stays invisible.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb, type AppDb } from "@/lib/db";
import { getViewerAccess, type ViewerAccess } from "@/lib/builder-league/access";
import { parseCursor, type Cursor } from "@/lib/builder-league/http";
import { EVIDENCE_STATUSES, type EvidenceStatus } from "@/lib/builder-league/types";
import { getPathname, redirect } from "@/i18n/navigation";

export interface LeagueViewer {
  db: AppDb;
  user: { id: string; name: string; email: string; role: string | null } | null;
  access: ViewerAccess;
}

export async function getLeagueViewer(): Promise<LeagueViewer> {
  const db = getDb();
  let session: Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>> = null;
  try {
    session = await getAuth().api.getSession({ headers: await headers() });
  } catch (err) {
    console.warn("builder league: session lookup failed", err instanceof Error ? err.message : err);
  }
  const raw = session?.user as { id: string; name: string; email: string; role?: string | null } | undefined;
  const user = raw ? { id: raw.id, name: raw.name, email: raw.email, role: raw.role ?? null } : null;
  const access = await getViewerAccess(db, user ? { id: user.id, role: user.role } : null);
  return { db, user, access };
}

export type MemberPageViewer = LeagueViewer & { user: NonNullable<LeagueViewer["user"]> };

/**
 * Members (and admins) only. Signed-out visitors go to sign-in once the league is public; while it is
 * hidden, everyone without access gets a 404. Returns `null` when the league is public but the viewer
 * has no paid membership, so the page can explain how to join.
 */
export async function requireLeagueMember(locale: string, path: string): Promise<MemberPageViewer | null> {
  const viewer = await getLeagueViewer();
  if (!viewer.user) {
    if (!viewer.access.flagEnabled) notFound();
    redirect({ href: { pathname: "/sign-in", query: { callbackUrl: getPathname({ href: path, locale }) } }, locale });
  }
  if (!viewer.access.canUse) {
    if (!viewer.access.flagEnabled) notFound();
    return null;
  }
  return viewer as MemberPageViewer;
}

/** Admin pages: a signed-in admin, or a 404 for everyone else. */
export async function requireLeagueAdmin(): Promise<MemberPageViewer> {
  const viewer = await getLeagueViewer();
  if (!viewer.user || !viewer.access.isAdmin) notFound();
  return viewer as MemberPageViewer;
}

/** First value of a search parameter. */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A valid evidence status from the query string, or undefined (never throws on bad input). */
export function statusParam(value: string | string[] | undefined): EvidenceStatus | undefined {
  const status = param(value);
  return status && (EVIDENCE_STATUSES as readonly string[]).includes(status) ? (status as EvidenceStatus) : undefined;
}

/** A keyset cursor from the query string, or null when absent or malformed. */
export function cursorParam(value: string | string[] | undefined): Cursor | null {
  try {
    return parseCursor(param(value));
  } catch {
    return null;
  }
}
