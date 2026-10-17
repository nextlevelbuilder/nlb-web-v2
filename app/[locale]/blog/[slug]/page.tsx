import React, { cache } from "react";
import { notFound } from "next/navigation";
import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { BLOG_SLUG_RE, MAX_BLOG_SLUG_LENGTH } from "@/lib/blog/blog-slug-rules";
import { findAdjacentPublishedPosts, findPublishedTranslation, getPublishedPost } from "@/lib/blog/blog-queries";
import { blogPostJsonLd, blogPostMetadata } from "@/lib/blog/blog-seo";
import { isBlogLocale } from "@/lib/blog/blog-types";
import { serializeJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface BlogPostPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/** Published post plus its published translation; deduplicated between metadata and page render. */
const loadPost = cache(async (locale: string, slug: string) => {
  if (!isBlogLocale(locale) || slug.length > MAX_BLOG_SLUG_LENGTH || !BLOG_SLUG_RE.test(slug)) return null;
  const post = await getPublishedPost(locale, slug);
  if (!post) return null;
  return { post, translation: await findPublishedTranslation(post) };
});

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { locale, slug } = await params;
  const loaded = await loadPost(locale, slug);
  if (!loaded) return { title: "Not found", robots: { index: false } };
  return blogPostMetadata(loaded.post, loaded.translation);
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { locale, slug } = await params;
  const loaded = await loadPost(locale, slug);
  if (!loaded) notFound();
  const adjacent = await findAdjacentPublishedPosts(loaded.post);

  return (
    <main id="main" className="blog-post-main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogPostJsonLd(loaded.post)) }} />
      <BlogPostLayout post={loaded.post} translation={loaded.translation} adjacent={adjacent} />
    </main>
  );
}
