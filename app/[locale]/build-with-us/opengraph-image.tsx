import { getTranslations } from "next-intl/server";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { navLabel, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders product directory";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toOgLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "buildWithUs" });
  return renderConstellationOgCard({ numeral: "IV", kicker: await navLabel(locale, "directory"), title: t("heroTitle"), subtitle: t("heroDesc") });
}
