import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { navLabel, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders blog";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toOgLocale((await params).locale);
  const copy = BLOG_COPY[locale];
  return renderConstellationOgCard({ numeral: "IX", kicker: await navLabel(locale, "blog"), title: copy.indexTitle, subtitle: copy.indexDescription });
}
