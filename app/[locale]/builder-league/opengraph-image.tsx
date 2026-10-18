import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { getHomeCopy } from "@/content/builder-league/home-copy";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Builder League on Next Level Builders";

/** Generic card only: the member home is personal, so no member data reaches the image. */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const copy = getHomeCopy(locale);
  return renderConstellationOgCard({ numeral: "V", kicker: copy.eyebrow, title: copy.ogTitle, subtitle: copy.ogSubtitle });
}
