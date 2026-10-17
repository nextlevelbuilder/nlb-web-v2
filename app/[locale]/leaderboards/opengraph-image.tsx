import { getTranslations } from "next-intl/server";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { navLabel, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders leaderboard";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toOgLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "leaderboards" });
  return renderConstellationOgCard({ numeral: "IV·i", kicker: await navLabel(locale, "leaderboard"), title: t("title"), subtitle: t("desc") });
}
