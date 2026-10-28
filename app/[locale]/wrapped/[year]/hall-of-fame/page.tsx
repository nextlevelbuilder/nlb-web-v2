import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { isBuilderLeagueEnabled } from "@/lib/builder-league/access";
import { getHallOfFame, hallOfFamePath } from "@/lib/builder-league/hall-of-fame";
import { localYear } from "@/lib/builder-league/time-windows";
import { canSeePublicSurface, getPageViewer, isReviewableYear } from "@/lib/builder-league/wrapped-access";
import { getHallOfFameCopy } from "@/content/builder-league/hall-of-fame-copy";
import HallOfFameBoards from "@/components/builder-league/wrapped/hall-of-fame-boards";
import { formatLocalDate } from "@/components/builder-league/journey/journey-format";
import { Link } from "@/i18n/navigation";
import { pageMetadata, serializeJsonLd } from "@/lib/seo";
import { hallOfFameJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

interface HallOfFamePageProps {
  params: Promise<{ locale: string; year: string }>;
}

function parseYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return isReviewableYear(year, localYear(new Date())) ? year : null;
}

export async function generateMetadata({ params }: HallOfFamePageProps): Promise<Metadata> {
  const { locale, year: yearParam } = await params;
  const year = parseYear(yearParam) ?? 0;
  const copy = getHallOfFameCopy(locale);
  const meta = pageMetadata({ title: copy.metaTitle(year), description: copy.metaDescription(year), path: hallOfFamePath(year), locale });
  // Hidden from search while the Builder League is not public, like Community Wrapped.
  return isBuilderLeagueEnabled() ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function HallOfFamePage({ params }: HallOfFamePageProps) {
  const { locale, year: yearParam } = await params;
  const year = parseYear(yearParam);
  if (!year) notFound();
  const db = getDb();
  const { access } = await getPageViewer(db);
  if (!canSeePublicSurface(access)) notFound();
  const copy = getHallOfFameCopy(locale);
  const hall = await getHallOfFame(db, year, new Date());
  const overall = hall.status === "final" ? hall.boards.find((board) => board.board === "overall") : undefined;
  // Structured data only for official results on a public, indexable page.
  const jsonLd =
    hall.status === "final" && isBuilderLeagueEnabled()
      ? hallOfFameJsonLd({
          year,
          locale,
          name: copy.title(year),
          description: copy.metaDescription(year),
          members: (overall?.entries ?? []).map((entry) => ({ name: entry.name, passportPath: entry.passportPublic ? `/builders/${entry.userId}` : null })),
          modifiedAt: hall.finalizedAt,
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
            <span className={hall.status === "final" ? "text-primary" : "text-ink-2"}>{hall.status === "final" ? copy.status.final : copy.status.notFinal}</span>
            {hall.status === "final" && <span>{copy.finalMeta(formatLocalDate(locale, hall.finalizedAt))}</span>}
          </p>
        </header>

        {hall.status === "final" ? (
          <HallOfFameBoards year={year} boards={hall.boards} copy={copy} locale={locale} />
        ) : (
          <section aria-labelledby="hof-not-final" className="surface-panel max-w-3xl space-y-3 p-5 sm:p-7">
            <h2 id="hof-not-final" className="font-display text-step-xl font-light italic">{copy.notFinal.title(year)}</h2>
            <p className="text-step-sm text-ink-2">{copy.notFinal[hall.reason](formatLocalDate(locale, hall.finalAfter))}</p>
          </section>
        )}

        <section aria-labelledby="hof-method" className="space-y-2 border-t border-line pt-6 text-step-sm text-ink-2">
          <h2 id="hof-method" className="font-mono text-step-xs uppercase tracking-[0.16em] text-ink-3">{copy.methodHeading}</h2>
          <p className="max-w-[70ch]">{copy.method}</p>
        </section>

        <p className="flex flex-wrap items-center gap-4">
          {!access.canUse && <Link className="btn btn-primary" href="/#pricing">{copy.cta}</Link>}
          <Link className="inline-flex min-h-[44px] items-center text-step-sm text-primary hover:underline hover:underline-offset-4" href={`/wrapped/${year}`}>
            {copy.wrappedLink(year)}
          </Link>
        </p>
      </div>
    </main>
  );
}
