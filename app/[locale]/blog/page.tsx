import React from "react";
import { notFound } from "next/navigation";
import { BlogEmptyState, BlogPagination, BlogTagFilter } from "@/components/blog/blog-index-controls";
import { BLOG_NUMERAL, BlogPlate } from "@/components/blog/blog-plate";
import { BlogFeaturedPost, BlogPostCard } from "@/components/blog/blog-post-card";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { listPublishedPostItems, listPublishedTags } from "@/lib/blog/blog-queries";
import { blogIndexMetadata } from "@/lib/blog/blog-seo";
import { isBlogLocale, type BlogLocale } from "@/lib/blog/blog-types";

export const dynamic = "force-dynamic";

/** Page 1 shows the featured post plus a full 3-column grid; later pages show grid rows only. */
const FIRST_PAGE_SIZE = 13;
const PAGE_SIZE = 12;
const TAG_RE = /^[^\s].{0,31}$/u;
const MAX_TAGS = 24;
const INDEX_COORD = "Lyra · RA 18h 36m · Dec +38° 47′";

interface BlogIndexProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string | string[]; page?: string | string[] }>;
}

/** Untrusted query params: a single tag of at most 32 chars and a positive page number. */
function parseFilters(raw: Awaited<BlogIndexProps["searchParams"]>): { tag?: string; page: number } {
  const tagValue = Array.isArray(raw.tag) ? raw.tag[0] : raw.tag;
  const tag = tagValue && TAG_RE.test(tagValue.trim()) ? tagValue.trim() : undefined;
  const pageValue = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isInteger(pageValue) && pageValue > 1 && pageValue <= 1000 ? pageValue : 1;
  return { tag, page };
}

function resolveLocale(locale: string): BlogLocale {
  if (!isBlogLocale(locale)) notFound();
  return locale;
}

function pageWindow(page: number): { offset: number; size: number } {
  return page === 1 ? { offset: 0, size: FIRST_PAGE_SIZE } : { offset: FIRST_PAGE_SIZE + (page - 2) * PAGE_SIZE, size: PAGE_SIZE };
}

export async function generateMetadata({ params, searchParams }: BlogIndexProps) {
  const locale = resolveLocale((await params).locale);
  return blogIndexMetadata(locale, parseFilters(await searchParams).tag);
}

export default async function BlogIndexPage({ params, searchParams }: BlogIndexProps) {
  const locale = resolveLocale((await params).locale);
  const { tag, page } = parseFilters(await searchParams);
  const copy = BLOG_COPY[locale];
  const { offset, size } = pageWindow(page);
  // Fetch one extra row to know whether an older page exists without a COUNT query.
  const [rows, tags] = await Promise.all([
    listPublishedPostItems({ locale, tag, limit: size + 1, offset }),
    listPublishedTags(locale, MAX_TAGS),
  ]);
  const posts = rows.slice(0, size);
  const hasOlder = rows.length > size;
  const featured = page === 1 ? posts[0] : undefined;
  const grid = featured ? posts.slice(1) : posts;
  const headline = copy.indexHeadline;

  return (
    <main id="main" className="blog-index">
      <div className="wrap">
        <div className="page-head blog-index-head">
          <BlogPlate numeral={BLOG_NUMERAL} name={copy.plateName} coord={INDEX_COORD} />
          <h1 className="h1-page">
            {headline.before}<em>{headline.accent}</em>{headline.after}
          </h1>
          <p className="lede">{copy.indexLede}</p>
          <BlogTagFilter locale={locale} tags={tags} active={tag} />
        </div>

        {posts.length === 0 ? (
          <BlogEmptyState locale={locale} tag={tag} showReset={Boolean(tag) || page > 1} />
        ) : (
          <>
            {featured && <BlogFeaturedPost post={featured} />}
            {grid.length > 0 && (
              <section className="catalogue blog-grid-section" aria-labelledby="blog-more-title">
                <h2 id="blog-more-title" className="catalogue-head mono">
                  <span>{tag ? copy.filteredBy(tag) : copy.moreHeading}</span>
                  <span className="rule" aria-hidden="true" />
                </h2>
                <ul className="cards blog-cards">
                  {grid.map((post, index) => (
                    <li key={post.id}><BlogPostCard post={post} index={offset + index + (featured ? 1 : 0)} /></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <BlogPagination locale={locale} tag={tag} page={page} hasOlder={hasOlder} />
      </div>
    </main>
  );
}
