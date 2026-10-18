import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { isBuilderLeagueEnabled } from "@/lib/builder-league/access";
import { communityWrappedData, loadCommunityWrapped } from "@/lib/builder-league/community-wrapped";
import { localDateKey, localYear } from "@/lib/builder-league/time-windows";
import { canSeePublicSurface, getPageViewer, isReviewableYear } from "@/lib/builder-league/wrapped-access";
import { getWrappedCopy } from "@/content/builder-league/wrapped-copy";
import CommunityMetrics from "@/components/builder-league/wrapped/community-metrics";
import { formatLocalDate } from "@/components/builder-league/journey/journey-format";
import { Link } from "@/i18n/navigation";
import { pageMetadata, serializeJsonLd } from "@/lib/seo";
import { communityWrappedJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

interface CommunityWrappedPageProps {
  params: Promise<{ locale: string; year: string }>;
}

function parseYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return isReviewableYear(year, localYear(new Date())) ? year : null;
}

export async function generateMetadata({ params }: CommunityWrappedPageProps): Promise<Metadata> {
  const { locale, year: yearParam } = await params;
  const year = parseYear(yearParam) ?? 0;
  const copy = getWrappedCopy(locale).community;
  const meta = pageMetadata({ title: copy.metaTitle(year), description: copy.metaDescription(year), path: `/wrapped/${year}`, locale });
  // Hidden from search while the Builder League is not public.
  return isBuilderLeagueEnabled() ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function CommunityWrappedPage({ params }: CommunityWrappedPageProps) {
  const { locale, year: yearParam } = await params;
  const year = parseYear(yearParam);
  if (!year) notFound();
  const db = getDb();
  const { access } = await getPageViewer(db);
  if (!canSeePublicSurface(access)) notFound();
  const copy = getWrappedCopy(locale).community;
  const snapshot = await loadCommunityWrapped(db, year, new Date());
  const data = communityWrappedData(snapshot);
  // Structured data only while the page is public and indexable.
  const jsonLd = isBuilderLeagueEnabled()
    ? communityWrappedJsonLd({
        year,
        locale,
        name: copy.title(year),
        description: copy.metaDescription(year),
        coverageStart: localDateKey(new Date(data.timeframe.start)),
        coverageEnd: localDateKey(new Date(Math.min(data.timeframe.end, data.timeframe.cutoffAt))),
        status: data.status,
        version: snapshot.version,
        modifiedAt: snapshot.createdAt,
      })
    : null;

  return (
    <main id="main" className="sky-backdrop flex-1">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
      <div className="wrap space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
        <header className="max-w-3xl space-y-5">
          <p className="eyebrow">{copy.eyebrow(year)}</p>
          <h1 className="font-display text-step-3xl font-light">{copy.title(year)}</h1>
          <p className="lede max-w-[60ch]">{copy.lede}</p>
          <p className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-step-xs text-ink-3">
            <span className={data.status === "final" ? "text-primary" : "text-ink-2"}>{copy.status[data.status]}</span>
            <span>{copy.versionMeta(snapshot.version, formatLocalDate(locale, snapshot.createdAt))}</span>
          </p>
          <p className="text-step-sm text-ink-2">{copy.statusNote[data.status]}</p>
        </header>
        <CommunityMetrics data={data} copy={copy} locale={locale} />
        {!access.canUse && (
          <p>
            <Link className="btn btn-primary" href="/#pricing">{copy.cta}</Link>
          </p>
        )}
      </div>
    </main>
  );
}
