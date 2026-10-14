import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { getPolicy, toPolicyLocale } from "@/content/policies";
import { policyUiCopy } from "@/content/policies/policy-ui-copy";
import { OG_COPY, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders policy";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const kicker = OG_COPY[toOgLocale(locale)].policies;
  const policy = getPolicy(slug, locale);
  if (!policy) return renderConstellationOgCard({ numeral: "§", kicker, title: policyUiCopy[toPolicyLocale(locale)].title });
  const copy = policyUiCopy[toPolicyLocale(locale)];
  return renderConstellationOgCard({ numeral: "§", kicker, title: policy.title, subtitle: policy.summary, meta: [`${copy.lastUpdated} ${policy.lastUpdated}`] });
}
