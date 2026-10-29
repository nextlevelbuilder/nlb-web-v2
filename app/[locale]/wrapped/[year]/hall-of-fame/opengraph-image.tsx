import { getDb } from "@/lib/db";
import { isBuilderLeagueEnabled } from "@/lib/builder-league/access";
import { getHallOfFame } from "@/lib/builder-league/hall-of-fame";
import { getHallOfFameCopy } from "@/content/builder-league/hall-of-fame-copy";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "NLB Builder League Hall of Fame";

export default async function Image({ params }: { params: Promise<{ locale: string; year: string }> }) {
  const { locale: rawLocale, year: yearParam } = await params;
  const locale = toOgLocale(rawLocale);
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();
  const copy = getHallOfFameCopy(locale);
  const meta: string[] = [];
  // The card carries status only, never member names: OG images are cached for days by crawlers and
  // CDNs, so a name on it would outlive a member revoking their public-board consent.
  if (isBuilderLeagueEnabled()) {
    const hall = await getHallOfFame(getDb(), year).catch(() => null);
    if (hall) meta.push(hall.status === "final" ? copy.status.final : copy.status.notFinal);
  }
  return renderConstellationOgCard({ numeral: "V", kicker: copy.ogKicker(year), title: copy.title(year), subtitle: copy.lede, meta });
}
