import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { LIVE_PLATE_NUMERAL } from "@/components/live/live-ui-helpers";
import { getLiveCopy } from "@/lib/live/live-copy";
import { isLiveEnabled } from "@/lib/live/live-flag";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "NLB Live: weekly live build sessions";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // With the flag off the page is a 404; the card stays generic so nothing about Live leaks.
  if (!isLiveEnabled()) return renderConstellationOgCard({ numeral: LIVE_PLATE_NUMERAL, kicker: "Next Level Builders", title: "Next Level Builders" });
  const copy = getLiveCopy(locale);
  return renderConstellationOgCard({ numeral: LIVE_PLATE_NUMERAL, kicker: copy.navLabel, title: copy.title, subtitle: copy.description });
}
