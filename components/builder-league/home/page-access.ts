import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getViewerAccess, type ViewerAccess } from "@/lib/builder-league/access";

export interface BuilderPageUser {
  id: string;
  name: string;
  role: string | null;
}

export interface BuilderPageViewer {
  user: BuilderPageUser | null;
  access: ViewerAccess;
}

/** The signed-in visitor (if any) and their Builder League access. */
export async function getBuilderPageViewer(): Promise<BuilderPageViewer> {
  let user: BuilderPageUser | null = null;
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (session?.user) {
      user = { id: session.user.id, name: session.user.name, role: (session.user as { role?: string | null }).role ?? null };
    }
  } catch (err) {
    console.warn("Builder League session lookup failed:", err);
  }
  return { user, access: await getViewerAccess(getDb(), user) };
}

/**
 * Member pages: while the league flag is off, everyone outside the pilot gets a 404, so the league
 * stays invisible. With the flag on, visitors see a sign-in or membership panel instead.
 */
export async function requireBuilderPageViewer(): Promise<BuilderPageViewer> {
  const viewer = await getBuilderPageViewer();
  if (!viewer.access.flagEnabled && !viewer.access.canUse) notFound();
  return viewer;
}

/** Number formatting shared by the league pages (scores keep at most two decimals). */
export function formatScore(locale: string, value: number): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}
