/**
 * Shared frame for the Builder League progression pages (badges, missions, seasons, rewards, Ship Relay,
 * Kill Board, Time Capsule): access gate, section navigation and page header.
 *
 * Access follows the API: with the feature flag off, people without access get a 404 so the league does
 * not leak; with it on, signed-out visitors see a sign-in panel and signed-in non-members a membership panel.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getAuth } from "@/lib/auth";
import { getDb, type AppDb } from "@/lib/db";
import { getViewerAccess, isBuilderLeagueEnabled, type ViewerAccess } from "@/lib/builder-league/access";
import { getBadgesCopy } from "@/content/builder-league/badges-copy";

export type ProgressionSection = "badges" | "missions" | "seasons" | "rewards" | "shipRelay" | "killBoard" | "timeCapsule";

export const PROGRESSION_SECTIONS: { key: ProgressionSection; numeral: string; href: string }[] = [
  { key: "badges", numeral: "I", href: "/builder-league/badges" },
  { key: "missions", numeral: "II", href: "/builder-league/missions" },
  { key: "seasons", numeral: "III", href: "/builder-league/seasons" },
  { key: "rewards", numeral: "IV", href: "/builder-league/rewards" },
  { key: "shipRelay", numeral: "V", href: "/builder-league/ship-relay" },
  { key: "killBoard", numeral: "VI", href: "/builder-league/kill-board" },
  { key: "timeCapsule", numeral: "VII", href: "/builder-league/time-capsule" },
];

export type ProgressionViewer =
  | { status: "ok"; db: AppDb; userId: string; name: string; access: ViewerAccess }
  | { status: "signed_out" | "not_member" };

/** Resolves the signed-in viewer and their Builder League access; calls `notFound()` while the flag hides the league. */
export async function loadProgressionViewer(): Promise<ProgressionViewer> {
  let user: { id: string; name: string; role?: string | null } | null = null;
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    user = session?.user ? { id: session.user.id, name: session.user.name, role: (session.user as { role?: string | null }).role } : null;
  } catch (err) {
    console.warn("builder league: session lookup failed (non-fatal)", err);
  }
  const flagEnabled = isBuilderLeagueEnabled();
  if (!user) {
    if (!flagEnabled) notFound();
    return { status: "signed_out" };
  }
  const db = getDb();
  const access = await getViewerAccess(db, user);
  if (!access.canUse) {
    if (!flagEnabled) notFound();
    return { status: "not_member" };
  }
  return { status: "ok", db, userId: user.id, name: user.name, access };
}

/** Member pages are personal: keep them out of search indexes. */
export function progressionMetadata(title: string, description: string): Metadata {
  return { title, description, robots: { index: false, follow: false } };
}

/** Dates in Vietnam time, which every Builder League window uses. */
export function formatLeagueDate(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(typeof value === "string" ? new Date(value) : value);
}

interface ProgressionShellProps {
  locale: string;
  section: ProgressionSection;
  eyebrow: string;
  title: string;
  lede: string;
  viewer: ProgressionViewer;
  /** Optional line under the lede (rules, fairness note). */
  note?: string;
  children?: ReactNode;
}

export function ProgressionShell({ locale, section, eyebrow, title, lede, viewer, note, children }: ProgressionShellProps) {
  const copy = getBadgesCopy(locale).shell;
  const callbackUrl = PROGRESSION_SECTIONS.find((s) => s.key === section)?.href ?? "/builder-league/badges";
  const showPilotNote = viewer.status === "ok" && !viewer.access.flagEnabled;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-5xl space-y-10 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <nav aria-label={copy.navLabel} className="border-b border-line pb-4">
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {PROGRESSION_SECTIONS.map((item) => {
                const current = item.key === section;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center gap-2 border-b font-mono text-step-xs uppercase tracking-[0.08em] transition-colors duration-base focus-ring ${
                        current ? "border-primary text-foreground" : "border-transparent text-ink-3 hover:text-foreground"
                      }`}
                    >
                      <span aria-hidden className="font-display text-base normal-case italic tracking-normal text-primary">
                        {item.numeral}
                      </span>
                      {copy.nav[item.key]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <header className="space-y-5">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="font-display text-step-3xl font-light text-balance">{title}</h1>
            <p className="lede max-w-[60ch]">{lede}</p>
            {note ? <p className="max-w-[70ch] text-step-sm text-ink-3">{note}</p> : null}
            {showPilotNote ? <p className="mono-label text-ink-3">{copy.pilotNote}</p> : null}
          </header>

          {viewer.status === "signed_out" ? (
            <AccessPanel title={copy.signInTitle} body={copy.signInBody} cta={copy.signInCta} href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`} />
          ) : viewer.status === "not_member" ? (
            <AccessPanel title={copy.membershipTitle} body={copy.membershipBody} cta={copy.membershipCta} href="/#pricing" />
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}

function AccessPanel({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <section className="surface-panel max-w-xl space-y-4 p-6 sm:p-8">
      <h2 className="font-display text-step-xl">{title}</h2>
      <p className="text-ink-2">{body}</p>
      <Link href={href} className="btn btn-primary btn-sm focus-ring">
        {cta}
      </Link>
    </section>
  );
}
