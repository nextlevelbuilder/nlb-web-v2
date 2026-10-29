import { notFound } from "next/navigation";
import ChapterPlate from "@/components/constellation/chapter-plate";
import { LiveEmptyPlate } from "@/components/live/live-empty-plate";
import { LiveEventHero } from "@/components/live/live-event-hero";
import { LiveEventList } from "@/components/live/live-event-list";
import { LivePollSection } from "@/components/live/live-poll-section";
import { LIVE_PLATE_COORD, LIVE_PLATE_NUMERAL, liveEventDescription, liveEventTitle, selectEventCta } from "@/components/live/live-ui-helpers";
import { getDb } from "@/lib/db";
import { listPastEvents, listUpcomingEvents } from "@/lib/live/event-read-models";
import { getLiveCopy } from "@/lib/live/live-copy";
import { isLiveEnabled } from "@/lib/live/live-flag";
import { getCurrentPollRound } from "@/lib/live/poll-read-models";
import { pageMetadata, serializeJsonLd } from "@/lib/seo";
import { breadcrumbJsonLd, liveEventJsonLd } from "@/lib/structured-data";
import { loadLiveViewer, loadTicketSummary, loadTopicGroups } from "./live-page-data";
import "./live-page.css";

export const dynamic = "force-dynamic";

interface LivePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: LivePageProps) {
  const { locale } = await params;
  if (!isLiveEnabled()) return { title: "Not found", robots: { index: false } };
  const copy = getLiveCopy(locale);
  return pageMetadata({ title: copy.title, description: copy.description, path: "/live", locale });
}

/** NLB Live: the next session and its seat, the weekly topic vote, upcoming and previous sessions. */
export default async function LivePage({ params, searchParams }: LivePageProps) {
  if (!isLiveEnabled()) notFound();
  const { locale } = await params;
  const copy = getLiveCopy(locale);
  const db = getDb();
  const now = new Date();
  const viewer = await loadLiveViewer();
  const [upcoming, past, round] = await Promise.all([
    listUpcomingEvents(db, now, 12),
    listPastEvents(db, now, 12),
    getCurrentPollRound(db, now, viewer?.id ?? null),
  ]);
  const [next, ...later] = upcoming;
  const [ticket, groupOf] = await Promise.all([
    next ? loadTicketSummary(db, next, viewer, now) : Promise.resolve(null),
    loadTopicGroups(round?.topics.map((t) => t.id) ?? [], locale, db),
  ]);
  const paymentReturned = (await searchParams).payment === "success";

  const jsonLd = [
    breadcrumbJsonLd([{ name: "Next Level Builders", path: "/" }, { name: copy.title, path: "/live" }], locale),
    ...upcoming.map((event) =>
      liveEventJsonLd({ ...event, locale, name: liveEventTitle(event, locale), description: liveEventDescription(event, locale) })
    ),
  ];

  return (
    <main id="main" className="live-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="wrap">
        <header className="page-head">
          <ChapterPlate numeral={LIVE_PLATE_NUMERAL} name={copy.plateName} coord={LIVE_PLATE_COORD} />
          <h1 className="h1-page">
            {copy.headingLead}<em>{copy.headingAccent}</em>{copy.headingTail}
          </h1>
          <p className="lede">{copy.description}</p>
        </header>

        <section className="live-section live-section-hero" aria-label={copy.nextEventLabel}>
          {next ? (
            <LiveEventHero
              event={next}
              locale={locale}
              cta={selectEventCta({ status: next.status, endsAt: next.endsAt, seatsLeft: next.seatsLeft, viewer, ticket, now })}
              paymentReturned={paymentReturned}
              showTitle
            />
          ) : (
            <LiveEmptyPlate kicker={copy.noEventKicker} title={copy.noEventTitle} body={copy.noEventBody} />
          )}
        </section>

        <LivePollSection round={round} groupOf={groupOf} viewer={viewer} locale={locale} />
        {next && <LiveEventList kind="upcoming" events={later} locale={locale} />}
        <LiveEventList kind="past" events={past} locale={locale} />
      </div>
    </main>
  );
}
