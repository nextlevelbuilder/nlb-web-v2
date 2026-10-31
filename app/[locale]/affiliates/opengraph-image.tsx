import { getTranslations } from "next-intl/server";
import { AFFILIATE_PLATE_NUMERAL } from "@/components/affiliates/affiliate-plate";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { toOgLocale } from "@/lib/og/og-route-helpers";
import { isAffiliatesEnabled } from "@/lib/referrals/referral-env";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders affiliate program";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // With the flag off the page is a 404; the card stays generic so nothing about the program leaks.
  if (!isAffiliatesEnabled()) return renderConstellationOgCard({ numeral: AFFILIATE_PLATE_NUMERAL, kicker: "Next Level Builders", title: "Next Level Builders" });
  const t = await getTranslations({ locale: toOgLocale(locale), namespace: "affiliates" });
  return renderConstellationOgCard({ numeral: AFFILIATE_PLATE_NUMERAL, kicker: t("navLabel"), title: t("metaTitle"), subtitle: t("metaDescription") });
}
