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
  // Names appear on the card only once the league is public and the year is final; crawlers carry no session.
  if (isBuilderLeagueEnabled()) {
    const hall = await getHallOfFame(getDb(), year).catch(() => null);
    if (hall?.status === "final") {
      meta.push(copy.status.final);
      const overall = hall.boards.find((board) => board.board === "overall");
      for (const entry of overall?.entries.slice(0, 3) ?? []) meta.push(`${entry.rank}. ${entry.name}`);
    } else if (hall) {
      meta.push(copy.status.notFinal);
    }
  }
  return renderConstellationOgCard({ numeral: "V", kicker: copy.ogKicker(year), title: copy.title(year), subtitle: copy.lede, meta });
}
