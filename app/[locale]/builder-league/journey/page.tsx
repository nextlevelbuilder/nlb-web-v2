import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getJourney, journeyMonths } from "@/lib/builder-league/journey";
import { localYear } from "@/lib/builder-league/time-windows";
import { requirePrivatePageViewer } from "@/lib/builder-league/wrapped-access";
import { getJourneyCopy } from "@/content/builder-league/journey-copy";
import JourneyTimeline, { journeyItemLabel } from "@/components/builder-league/journey/journey-timeline";
import JourneyConstellation from "@/components/builder-league/journey/journey-constellation";
import { layoutConstellation } from "@/components/builder-league/journey/constellation-layout";
import { formatMonthKey } from "@/components/builder-league/journey/journey-format";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

interface JourneyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: JourneyPageProps): Promise<Metadata> {
  const copy = getJourneyCopy((await params).locale);
  return { title: copy.metaTitle, description: copy.metaDescription, robots: { index: false, follow: false } };
}

export default async function JourneyPage({ params }: JourneyPageProps) {
  const { locale } = await params;
  const copy = getJourneyCopy(locale);
  const db = getDb();
  const user = await requirePrivatePageViewer(locale, "/builder-league/journey", db);
  const journey = await getJourney(db, user.id);
  const months = journeyMonths(journey.items);
  const { stars, lanes } = layoutConstellation(journey.items, (item) => journeyItemLabel(item, copy, locale));
  const year = localYear(new Date());

  return (
    <main id="main" className="sky-backdrop flex-1">
      <div className="wrap space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
        <header className="max-w-3xl space-y-5">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="font-display text-step-3xl font-light">{copy.title}</h1>
          <p className="lede max-w-[60ch]">{copy.lede}</p>
          {months.length > 0 && (
            <p className="font-mono text-step-xs text-ink-3">{copy.untrackedBefore(formatMonthKey(locale, months[0]))}</p>
          )}
          {year >= 2026 && (
            <Link className="link-arrow text-step-sm" href={`/builder-league/year/${year}`}>{copy.yearLink(year)}</Link>
          )}
        </header>

        {journey.items.length === 0 ? (
          <section className="surface-panel px-6 py-16 text-center">
            <h2 className="font-display text-step-xl font-normal">{copy.empty.title}</h2>
            <p className="mt-2 text-step-sm text-ink-2">{copy.empty.body}</p>
          </section>
        ) : (
          <>
            {stars.length > 0 && (
              <section aria-labelledby="journey-constellation" className="space-y-4">
                <h2 id="journey-constellation" className="font-mono text-step-xs uppercase tracking-[0.2em] text-ink-2">{copy.constellationHeading}</h2>
                <JourneyConstellation stars={stars} lanes={lanes} laneLabels={copy.stages} label={copy.constellationLabel(stars.length)} hint={copy.constellationHint} />
              </section>
            )}
            <section aria-labelledby="journey-timeline" className="max-w-3xl space-y-6">
              <h2 id="journey-timeline" className="font-mono text-step-xs uppercase tracking-[0.2em] text-ink-2">{copy.timelineHeading}</h2>
              <JourneyTimeline items={journey.items} copy={copy} locale={locale} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
