import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { getPublishedPost } from "@/lib/blog/blog-queries";
import { readingMinutes } from "@/lib/blog/blog-reading-time";
import { BLOG_SLUG_RE, MAX_BLOG_SLUG_LENGTH } from "@/lib/blog/blog-slug-rules";
import { navLabel, OG_COPY, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders blog post";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const locale = toOgLocale(rawLocale);
  const kicker = await navLabel(locale, "blog");
  const valid = rawLocale === locale && slug.length <= MAX_BLOG_SLUG_LENGTH && BLOG_SLUG_RE.test(slug);
  const post = valid ? await getPublishedPost(locale, slug) : null;
  if (!post) return renderConstellationOgCard({ numeral: "IX", kicker, title: "Next Level Builders" });
  const meta = [post.authorName ?? "", OG_COPY[locale].readingTime(readingMinutes(post.blocks)), ...post.tags.slice(0, 1).map((tag) => `#${tag}`)];
  return renderConstellationOgCard({ numeral: "IX", kicker, title: post.seo.title ?? post.title, subtitle: post.seo.description ?? post.description, meta });
}
