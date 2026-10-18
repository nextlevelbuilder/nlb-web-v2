import { getDb } from "@/lib/db";
import { isBuilderLeagueEnabled } from "@/lib/builder-league/access";
import { loadSharedYear } from "@/lib/builder-league/wrapped-access";
import { getWrappedCopy } from "@/content/builder-league/wrapped-copy";
import { getYearReviewCopy } from "@/content/builder-league/year-review-copy";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "A year among the stars on Next Level Builders";

/**
 * Share card of a Year in Review link. It shows only the public subset, and falls back to a generic
 * card (no name, no figures) for revoked or unknown links and while the league is not public.
 */
export default async function Image({ params }: { params: Promise<{ locale: string; year: string; token: string }> }) {
  const { locale: rawLocale, year: yearParam, token } = await params;
  const locale = toOgLocale(rawLocale);
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : 0;
  const copy = getWrappedCopy(locale).shared;
  const yearCopy = getYearReviewCopy(locale);
  const view = year && isBuilderLeagueEnabled() ? await loadSharedYear(getDb(), token, year).catch(() => null) : null;
  if (!view || view.review.scenes.length === 0) {
    return renderConstellationOgCard({ numeral: "VIII", kicker: "Year in Review", title: copy.cta, subtitle: copy.ctaBody });
  }
  const { review } = view;
  const meta = [yearCopy.status[review.status], `${review.stats.verifiedMilestones} ${yearCopy.stats.milestones.toLowerCase()}`];
  if (review.archetype) meta.push(yearCopy.archetypes[review.archetype.key].name);
  return renderConstellationOgCard({
    numeral: "VIII",
    kicker: `Year in Review ${year}`,
    title: copy.title(view.ownerName || copy.unknownName, year),
    subtitle: review.scenes.map((scene) => yearCopy.scenes[scene.key].title).slice(0, 4).join(" · "),
    meta,
  });
}
