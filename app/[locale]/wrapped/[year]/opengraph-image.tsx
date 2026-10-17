import { getDb } from "@/lib/db";
import { getLatestCommunityWrapped, communityWrappedData } from "@/lib/builder-league/community-wrapped";
import { isBuilderLeagueEnabled } from "@/lib/builder-league/access";
import { getWrappedCopy } from "@/content/builder-league/wrapped-copy";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "NLB Community Wrapped";

export default async function Image({ params }: { params: Promise<{ locale: string; year: string }> }) {
  const { locale: rawLocale, year: yearParam } = await params;
  const locale = toOgLocale(rawLocale);
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();
  const copy = getWrappedCopy(locale).community;
  const meta: string[] = [];
  // Figures appear on the card only once the league is public; crawlers carry no session.
  if (isBuilderLeagueEnabled()) {
    const snapshot = await getLatestCommunityWrapped(getDb(), year).catch(() => null);
    if (snapshot) {
      const data = communityWrappedData(snapshot);
      meta.push(copy.status[data.status]);
      for (const metric of data.metrics.slice(0, 3)) {
        if (!metric.suppressed && metric.value !== null) meta.push(`${metric.value} ${copy.metrics[metric.key].label.toLowerCase()}`);
      }
    }
  }
  return renderConstellationOgCard({ numeral: "VIII", kicker: `Wrapped ${year}`, title: copy.title(year), subtitle: copy.lede, meta });
}
