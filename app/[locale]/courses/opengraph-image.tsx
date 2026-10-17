import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { getCoursesCopy } from "@/lib/courses/courses-copy";
import { navLabel } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders courses";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const copy = getCoursesCopy(locale);
  return renderConstellationOgCard({ numeral: "III", kicker: await navLabel(locale, "courses"), title: copy.listTitle, subtitle: copy.listSubtitle });
}
