import Link from "next/link";
import type { LivePublicEvent } from "@/lib/live/event-read-models";
import { getLiveCopy, type LiveCopy } from "@/lib/live/live-copy";
import { localizedPath } from "@/lib/seo";
import { LiveCheckoutDialog } from "./live-checkout-dialog";
import { LiveJoinPanel } from "./live-join-panel";
import { LiveRefreshButton } from "./live-refresh-button";
import { formatLiveDateTime, formatLivePrice, formatLiveTime, liveEventTitle, seatMeter, type LiveEventCta } from "./live-ui-helpers";

export function seatsText(event: Pick<LivePublicEvent, "seatsLeft" | "capacity">, copy: LiveCopy): string | null {
  const meter = seatMeter(event.seatsLeft, event.capacity);
  if (!meter) return null;
  if (meter.kind === "sold_out") return copy.seatsSoldOut;
  return meter.kind === "left" ? copy.seatsLeft(meter.left, event.capacity) : copy.seatsLimited(event.capacity);
}

interface LiveEventHeroProps {
  event: LivePublicEvent;
  locale: string;
  cta: LiveEventCta;
  /** Back from Polar with `?payment=success`. */
  paymentReturned: boolean;
  /** On /live the hero names the event (h2 linking to its page); the detail page has the h1 instead. */
  showTitle: boolean;
}

/** The event's facts (when, host, price, seats, status) and the one call to action its state allows. */
export function LiveEventHero({ event, locale, cta, paymentReturned, showTitle }: LiveEventHeroProps) {
  const copy = getLiveCopy(locale);
  const when = formatLiveDateTime(event.startsAt, locale, event.timezone);
  const price = formatLivePrice(event.priceCents, event.currency, locale, copy.free);
  const seats = seatsText(event, copy);
  const title = liveEventTitle(event, locale);
  const eventPath = localizedPath(`/live/${event.slug}`, locale);
  const signInHref = `${localizedPath("/sign-in", locale)}?callbackUrl=${encodeURIComponent(eventPath)}`;

  return (
    <article className="surface live-hero" aria-labelledby={showTitle ? `live-hero-${event.id}` : undefined}>
      <div className="live-hero-main">
        <p className="mono live-hero-kicker">
          <span className={`live-status live-status-${event.status}`}>{copy.status[event.status as keyof LiveCopy["status"]] ?? event.status}</span>
          {showTitle && <span>{copy.nextEventLabel}</span>}
        </p>
        {showTitle && (
          <h2 id={`live-hero-${event.id}`} className="live-hero-title">
            <Link href={eventPath}>{title}</Link>
          </h2>
        )}
        <dl className="live-facts">
          <div>
            <dt className="mono">{copy.whenLabel}</dt>
            <dd>
              <time dateTime={when.iso}>
                <span className="live-when-date">{when.date}</span>
                <span className="live-when-time">{when.time}</span>
              </time>
              <span className="mono live-when-zone">{when.zone}</span>
            </dd>
          </div>
          <div>
            <dt className="mono">{copy.hostLabel}</dt>
            <dd>{event.hostName}</dd>
          </div>
          <div>
            <dt className="mono">{copy.priceLabel}</dt>
            <dd>
              <span className="live-price">{price}</span>
              {event.hasMemberDiscount && event.priceCents > 0 && <span className="live-note">{copy.memberDiscount}</span>}
            </dd>
          </div>
          {seats && (
            <div>
              <dt className="mono">{copy.seatsLabel}</dt>
              <dd>{seats}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="live-hero-action">
        {paymentReturned && cta.kind !== "ticketed" && (
          <div className="live-notice" role="status">
            <p>{copy.paymentReturned}</p>
            <LiveRefreshButton label={copy.refresh} />
          </div>
        )}
        <HeroCta cta={cta} copy={copy} event={event} locale={locale} price={price} title={title} signInHref={signInHref} />
        {showTitle && (
          <Link href={eventPath} className="link-arrow live-hero-more">
            {copy.viewEvent} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </article>
  );
}

function HeroCta({ cta, copy, event, locale, price, title, signInHref }: {
  cta: LiveEventCta;
  copy: LiveCopy;
  event: LivePublicEvent;
  locale: string;
  price: string;
  title: string;
  signInHref: string;
}) {
  switch (cta.kind) {
    case "sign_in":
      return <Link className="btn btn-primary live-cta-btn" href={signInHref}>{copy.signInToBuy}</Link>;
    case "buy":
      return (
        <>
          {cta.heldUntil && <p className="live-note">{copy.ticketHeld(formatLiveTime(cta.heldUntil, event.timezone))}</p>}
          <LiveCheckoutDialog
            slug={event.slug}
            locale={locale}
            eventTitle={title}
            price={price}
            recordingNotice={locale === "vi" ? event.recordingNoticeVi : event.recordingNoticeEn}
            refundPolicy={locale === "vi" ? event.refundPolicyVi : event.refundPolicyEn}
            signInHref={signInHref}
          />
        </>
      );
    case "ticketed":
      return (
        <>
          <p className="badge live-ticket-badge">{copy.youHaveTicket}</p>
          <LiveJoinPanel slug={event.slug} locale={locale} timeZone={event.timezone} />
        </>
      );
    case "verify_email":
      return <p className="live-note live-note-strong">{copy.verifyEmailToBuy}</p>;
    case "ticket_exception":
      return <p className="live-note live-note-strong">{copy.ticketException}</p>;
    case "sales_not_open":
      return <p className="live-note live-note-strong">{copy.salesNotOpen}</p>;
    case "sold_out":
      return <p className="live-note live-note-strong">{copy.soldOut}</p>;
    case "sales_closed":
      return <p className="live-note live-note-strong">{copy.salesClosed}</p>;
    case "cancelled":
      return <p className="live-note live-note-strong">{copy.eventCancelled}</p>;
    case "ended":
      return <p className="live-note live-note-strong">{copy.eventEnded}</p>;
  }
}
