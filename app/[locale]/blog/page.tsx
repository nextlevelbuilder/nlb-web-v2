import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogPostCard } from "@/components/blog/blog-post-card";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { blogIndexMetadata } from "@/lib/blog/blog-seo";
import { blogIndexPath } from "@/lib/blog/blog-slug-rules";
import { isBlogLocale, type BlogLocale } from "@/lib/blog/blog-types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;
const TAG_RE = /^[^\s].{0,31}$/u;

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

export async function generateMetadata({ params, searchParams }: BlogIndexProps) {
  const locale = resolveLocale((await params).locale);
  return blogIndexMetadata(locale, parseFilters(await searchParams).tag);
}

function pageHref(locale: BlogLocale, tag: string | undefined, page: number): string {
  const query = new URLSearchParams();
  if (tag) query.set("tag", tag);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return `${blogIndexPath(locale)}${qs ? `?${qs}` : ""}`;
}

export default async function BlogIndexPage({ params, searchParams }: BlogIndexProps) {
  const locale = resolveLocale((await params).locale);
  const { tag, page } = parseFilters(await searchParams);
  const copy = BLOG_COPY[locale];
  // Fetch one extra row to know whether an older page exists without a COUNT query.
  const rows = await listPostSummaries({ status: "published", locale, tag, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
  const posts = rows.slice(0, PAGE_SIZE);
  const hasOlder = rows.length > PAGE_SIZE;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="flex-1 px-gutter pb-section-sm pt-28">
        <div className="mx-auto max-w-wrap">
          <header className="max-w-3xl border-b border-line pb-10">
            <h1 className="font-display text-step-3xl text-ink">{copy.indexHeading}</h1>
            <p className="mt-4 text-step-lg text-ink-2">{copy.indexLede}</p>
            {tag && (
              <p className="mt-6 flex flex-wrap items-center gap-3 text-step-sm">
                <span className="rounded-pill border border-star px-3 py-1 text-star">{copy.filteredBy(tag)}</span>
                <Link href={blogIndexPath(locale)} className="text-ink-3 underline underline-offset-4 hover:text-star">{copy.clearFilter}</Link>
              </p>
            )}
          </header>

          {posts.length === 0 ? (
            <section className="mx-auto max-w-xl py-24 text-center">
              <h2 className="font-display text-step-xl text-ink">{copy.emptyTitle}</h2>
              <p className="mt-3 text-ink-2">{tag ? copy.emptyTagBody(tag) : copy.emptyBody}</p>
              {(tag || page > 1) && (
                <Link href={blogIndexPath(locale)} className="mt-6 inline-block text-star underline underline-offset-4">{copy.clearFilter}</Link>
              )}
            </section>
          ) : (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => <BlogPostCard key={post.id} post={post} />)}
            </div>
          )}

          {(page > 1 || hasOlder) && (
            <nav className="mt-12 flex justify-between text-step-sm" aria-label="Pagination">
              {page > 1 ? <Link href={pageHref(locale, tag, page - 1)} className="text-star hover:underline">&larr; {copy.newer}</Link> : <span />}
              {hasOlder && <Link href={pageHref(locale, tag, page + 1)} className="text-star hover:underline">{copy.older} &rarr;</Link>}
            </nav>
          )}
        </div>
      </main>
    </div>
  );
}
