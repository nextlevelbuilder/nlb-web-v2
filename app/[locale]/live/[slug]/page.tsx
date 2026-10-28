import Link from "next/link";
import { notFound } from "next/navigation";
import ChapterPlate from "@/components/constellation/chapter-plate";
import { LiveEventHero } from "@/components/live/live-event-hero";
import { LIVE_PLATE_COORD, LIVE_PLATE_NUMERAL, isLiveSlug, liveEventDescription, liveEventTitle, selectEventCta } from "@/components/live/live-ui-helpers";
import { getDb } from "@/lib/db";
import { getPublicEventBySlug } from "@/lib/live/event-read-models";
import { getLiveCopy } from "@/lib/live/live-copy";
import { isLiveEnabled } from "@/lib/live/live-flag";
import { localizedPath, pageMetadata, serializeJsonLd } from "@/lib/seo";
import { breadcrumbJsonLd, liveEventJsonLd } from "@/lib/structured-data";
import { loadLiveViewer, loadTicketSummary } from "../live-page-data";
import "../live-page.css";

export const dynamic = "force-dynamic";

interface LiveEventPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** A published event (never a draft) while the Live flag is on; null otherwise. */
async function loadEvent(slug: string, now: Date) {
  if (!isLiveEnabled() || !isLiveSlug(slug)) return null;
  return getPublicEventBySlug(getDb(), slug, now);
}

export async function generateMetadata({ params }: LiveEventPageProps) {
  const { locale, slug } = await params;
  const event = await loadEvent(slug, new Date());
  if (!event) return { title: "Not found", robots: { index: false } };
  const title = liveEventTitle(event, locale);
  return pageMetadata({ title: `${title} · NLB Live`, description: liveEventDescription(event, locale) || title, path: `/live/${event.slug}`, locale });
}

export default async function LiveEventPage({ params, searchParams }: LiveEventPageProps) {
  const { locale, slug } = await params;
  const now = new Date();
  const event = await loadEvent(slug, now);
  if (!event) notFound();

  const copy = getLiveCopy(locale);
  const viewer = await loadLiveViewer();
  const ticket = await loadTicketSummary(getDb(), event, viewer, now);
  const paymentReturned = (await searchParams).payment === "success";
  const title = liveEventTitle(event, locale);
  const description = liveEventDescription(event, locale);
  const cta = selectEventCta({ status: event.status, endsAt: event.endsAt, seatsLeft: event.seatsLeft, viewer, ticket, now });

  const jsonLd = [
    liveEventJsonLd({ ...event, locale, name: title, description }),
    breadcrumbJsonLd(
      [{ name: "Next Level Builders", path: "/" }, { name: copy.title, path: "/live" }, { name: title, path: `/live/${event.slug}` }],
      locale
    ),
  ];

  return (
    <main id="main" className="live-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="wrap">
        <header className="page-head">
          <Link href={localizedPath("/live", locale)} className="link-arrow live-back">
            <span aria-hidden="true">←</span> {copy.back}
          </Link>
          <ChapterPlate numeral={LIVE_PLATE_NUMERAL} name={copy.detailPlate} coord={LIVE_PLATE_COORD} />
          <h1 className="h1-page live-detail-title">{title}</h1>
          <p className="mono live-detail-host">{copy.hostedBy(event.hostName)}</p>
        </header>
        <LiveEventHero event={event} locale={locale} cta={cta} paymentReturned={paymentReturned} showTitle={false} />
        {description && (
          <section className="live-section" aria-labelledby="live-about">
            <h2 id="live-about" className="live-section-title">{copy.aboutEvent}</h2>
            <p className="live-detail-desc">{description}</p>
          </section>
        )}
        {cta.kind === "ended" && (
          <p className="live-section">
            <Link className="link-arrow" href={localizedPath("/courses", locale)}>
              {copy.replayComing} <span aria-hidden="true">→</span>
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
