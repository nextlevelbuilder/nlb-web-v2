import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { LIVE_PLATE_NUMERAL, formatLiveDateTime, formatLivePrice, isLiveSlug, liveEventTitle } from "@/components/live/live-ui-helpers";
import { getDb } from "@/lib/db";
import { getPublicEventBySlug } from "@/lib/live/event-read-models";
import { getLiveCopy } from "@/lib/live/live-copy";
import { isLiveEnabled } from "@/lib/live/live-flag";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "NLB Live session";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const copy = getLiveCopy(locale);
  const event = isLiveEnabled() && isLiveSlug(slug) ? await getPublicEventBySlug(getDb(), slug, new Date()) : null;
  if (!event) return renderConstellationOgCard({ numeral: LIVE_PLATE_NUMERAL, kicker: "Next Level Builders", title: "Next Level Builders" });
  const when = formatLiveDateTime(event.startsAt, locale, event.timezone);
  return renderConstellationOgCard({
    numeral: LIVE_PLATE_NUMERAL,
    kicker: copy.navLabel,
    title: liveEventTitle(event, locale),
    subtitle: copy.hostedBy(event.hostName),
    meta: [when.date, `${when.time} ${when.zone.split(" · ")[0]}`, formatLivePrice(event.priceCents, event.currency, locale, copy.free)],
  });
}
