import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { toPolicyLocale } from "@/content/policies";
import { policyUiCopy } from "@/content/policies/policy-ui-copy";
import { OG_COPY, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders policies";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const copy = policyUiCopy[toPolicyLocale(locale)];
  return renderConstellationOgCard({ numeral: "§", kicker: OG_COPY[toOgLocale(locale)].policies, title: copy.title, subtitle: copy.subtitle });
}
