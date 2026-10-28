import Link from "next/link";
import type { LivePublicEvent } from "@/lib/live/event-read-models";
import { getLiveCopy, type LiveCopy } from "@/lib/live/live-copy";
import { localizedPath } from "@/lib/seo";
import { seatsText } from "./live-event-hero";
import { SectionHead } from "./live-section-head";
import { formatLiveDateTime, formatLivePrice, liveEventTitle } from "./live-ui-helpers";

/** Upcoming or previous sessions as a hairline list; previous ones point at Courses for the replay. */
export function LiveEventList({ kind, events, locale }: { kind: "upcoming" | "past"; events: LivePublicEvent[]; locale: string }) {
  const copy = getLiveCopy(locale);
  const headingId = `live-${kind}-heading`;
  return (
    <section className="live-section" aria-labelledby={headingId}>
      <SectionHead id={headingId} label={kind === "upcoming" ? copy.upcomingLabel : copy.pastLabel} title={kind === "upcoming" ? copy.upcomingHeading : copy.pastHeading} />
      {events.length === 0 ? (
        <p className="live-note live-list-empty">{kind === "upcoming" ? copy.upcomingEmpty : copy.pastEmpty}</p>
      ) : (
        <ul className="live-event-list">
          {events.map((event) => <EventRow key={event.id} event={event} kind={kind} locale={locale} copy={copy} />)}
        </ul>
      )}
    </section>
  );
}

function EventRow({ event, kind, locale, copy }: { event: LivePublicEvent; kind: "upcoming" | "past"; locale: string; copy: LiveCopy }) {
  const when = formatLiveDateTime(event.startsAt, locale, event.timezone);
  const seats = kind === "upcoming" ? seatsText(event, copy) : null;
  return (
    <li className="live-event-row">
      <time className="live-event-date" dateTime={when.iso}>
        <span>{when.date}</span>
        <span className="mono">{when.time} · {when.zone}</span>
      </time>
      <div className="live-event-text">
        <h3 className="live-event-title">
          <Link href={localizedPath(`/live/${event.slug}`, locale)}>{liveEventTitle(event, locale)}</Link>
        </h3>
        <p className="mono live-event-meta">
          <span>{copy.hostedBy(event.hostName)}</span>
          {kind === "upcoming" && <><span aria-hidden="true">·</span><span>{formatLivePrice(event.priceCents, event.currency, locale, copy.free)}</span></>}
          {seats && <><span aria-hidden="true">·</span><span>{seats}</span></>}
          {kind === "upcoming" && <><span aria-hidden="true">·</span><span>{copy.status[event.status as keyof LiveCopy["status"]] ?? event.status}</span></>}
        </p>
      </div>
      {kind === "past" && (
        <Link className="link-arrow live-replay-link" href={localizedPath("/courses", locale)}>
          {copy.replayComing} <span aria-hidden="true">→</span>
        </Link>
      )}
    </li>
  );
}
