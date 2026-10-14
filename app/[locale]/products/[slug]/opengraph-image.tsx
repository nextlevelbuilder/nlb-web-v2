import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { navLabel } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Product in the Next Level Builders directory";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const kicker = await navLabel(locale, "directory");
  const result = await getPublishedProductBySlug(slug);
  if (!result) return renderConstellationOgCard({ numeral: "IV", kicker, title: "Next Level Builders" });
  const { product, revision } = result;
  const categories = Array.isArray(revision.categoriesSnapshot) ? revision.categoriesSnapshot.filter((v): v is string => typeof v === "string") : [];
  const tags = Array.isArray(revision.tagsSnapshot) ? revision.tagsSnapshot.filter((v): v is string => typeof v === "string") : [];
  const meta = [categories[0] ?? "", ...tags.slice(0, 2).map((tag) => `#${tag}`)];
  return renderConstellationOgCard({ numeral: "IV", kicker, title: product.title, subtitle: product.tagline, meta });
}
