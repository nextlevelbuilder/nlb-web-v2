import { getTranslations } from "next-intl/server";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { OG_COPY, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders: every product starts as a single point of light";

/** Home card. Also the inherited fallback for inner pages without their own card. */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toOgLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home.meta" });
  // The meta title is "Next Level Builders — <tagline>"; the brand is already in the card header.
  const title = t("title").replace(/^Next Level Builders\s*[—–-]\s*/, "");
  return renderConstellationOgCard({ numeral: "I", kicker: OG_COPY[locale].community, title, subtitle: t("description") });
}
