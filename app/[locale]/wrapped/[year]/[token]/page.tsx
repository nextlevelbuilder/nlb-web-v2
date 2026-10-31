import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { canSeePublicSurface, getPageViewer, loadSharedYear } from "@/lib/builder-league/wrapped-access";
import { getJourneyCopy } from "@/content/builder-league/journey-copy";
import { getWrappedCopy } from "@/content/builder-league/wrapped-copy";
import { getYearReviewCopy } from "@/content/builder-league/year-review-copy";
import YearScenes, { publicScenesModel } from "@/components/builder-league/year-review/year-scenes";
import ShareVisitBeacon from "@/components/builder-league/wrapped/share-visit-beacon";
import { Link } from "@/i18n/navigation";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface SharedYearPageProps {
  params: Promise<{ locale: string; year: string; token: string }>;
}

const parseYear = (value: string) => (/^\d{4}$/.test(value) ? Number(value) : null);

export async function generateMetadata({ params }: SharedYearPageProps): Promise<Metadata> {
  const { locale, year: yearParam, token } = await params;
  const year = parseYear(yearParam);
  const copy = getWrappedCopy(locale).shared;
  const hidden: Metadata = { title: copy.cta, robots: { index: false, follow: false }, referrer: "no-referrer" };
  if (!year) return hidden;
  const db = getDb();
  const { access } = await getPageViewer(db);
  if (!canSeePublicSurface(access)) return hidden;
  const view = await loadSharedYear(db, token, year);
  if (!view) return hidden;
  const name = view.ownerName || copy.unknownName;
  const title = copy.metaTitle(name, year);
  const description = copy.metaDescription(year);
  const url = `${siteUrl()}${locale === "vi" ? "/vi" : ""}/wrapped/${year}/${token}`;
  return {
    title,
    description,
    // Share links are private by default: anyone holding the link can open it, but it never enters
    // search results (robots.txt blocks `/wrapped/*/` too), so the token is never published.
    robots: { index: false, follow: false },
    // The token is the credential: never send it to other sites in the Referer header.
    referrer: "no-referrer",
    openGraph: { title, description, url, type: "profile", siteName: "Next Level Builders", locale: locale === "en" ? "en_US" : "vi_VN" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedYearPage({ params }: SharedYearPageProps) {
  const { locale, year: yearParam, token } = await params;
  const year = parseYear(yearParam);
  if (!year) notFound();
  const db = getDb();
  const { access } = await getPageViewer(db);
  if (!canSeePublicSurface(access)) notFound();
  const view = await loadSharedYear(db, token, year);
  if (!view || view.review.scenes.length === 0) notFound();
  const copy = getWrappedCopy(locale).shared;
  const yearCopy = getYearReviewCopy(locale);
  const name = view.ownerName || copy.unknownName;

  return (
    <main id="main" className="sky-backdrop flex-1">
      <ShareVisitBeacon token={token} />
      <div className="wrap space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
        <header className="max-w-3xl space-y-5">
          <p className="eyebrow">{copy.eyebrow(year)}</p>
          <h1 className="font-display text-step-3xl font-light">{copy.title(name, year)}</h1>
          <p className="lede max-w-[60ch]">{copy.lede}</p>
          <p className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-step-xs text-ink-3">
            <span className={view.review.status === "final" ? "text-primary" : "text-ink-2"}>{yearCopy.status[view.review.status]}</span>
            <span>{yearCopy.rulesetMeta(view.review.rulesetVersion)}</span>
          </p>
        </header>
        <div className="max-w-3xl">
          <YearScenes model={publicScenesModel(view.review)} copy={yearCopy} journeyCopy={getJourneyCopy(locale)} locale={locale} />
        </div>
        <section className="surface-panel max-w-3xl space-y-4 p-6 sm:p-8">
          <h2 className="font-display text-step-xl font-light">{copy.cta}</h2>
          <p className="text-step-sm text-ink-2">{copy.ctaBody}</p>
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/#pricing">{copy.cta}</Link>
            <Link className="btn btn-ghost" href={`/wrapped/${year}`}>{copy.communityLink(year)}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
