/** Article layout for a published post: header (title, meta, cover), blocks, tags and language switch. */
import React from "react";
import Link from "next/link";
import { BLOG_COPY, formatBlogDate } from "@/lib/blog/blog-copy";
import { readingMinutes } from "@/lib/blog/blog-reading-time";
import { blogIndexPath, blogPostPath } from "@/lib/blog/blog-slug-rules";
import type { BlogPost, BlogPostSummary } from "@/lib/blog/blog-types";
import { BlogBlocks } from "./blog-block-renderers";

export function BlogPostLayout({ post, translation }: { post: BlogPost; translation: BlogPostSummary | null }) {
  const copy = BLOG_COPY[post.locale];
  const date = formatBlogDate(post.publishedAt, post.locale);
  const startsWithHero = post.blocks[0]?.type === "hero";
  return (
    <article lang={post.locale} className="px-gutter">
      <header className="mx-auto max-w-4xl">
        <Link href={blogIndexPath(post.locale)} className="font-mono text-step-xs uppercase text-ink-3 hover:text-star">&larr; {copy.backToBlog}</Link>
        <h1 className="mt-6 font-display text-step-3xl text-ink">{post.title}</h1>
        {post.description && !startsWithHero && <p className="mt-5 max-w-3xl text-step-lg text-ink-2">{post.description}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-6 text-step-sm text-ink-3">
          {post.authorName && <span className="text-ink-2">{copy.byAuthor(post.authorName)}</span>}
          {date && <time dateTime={post.publishedAt ?? undefined}>{copy.publishedOn} {date}</time>}
          <span>{copy.minutesRead(readingMinutes(post.blocks))}</span>
          {translation && (
            <Link href={blogPostPath(translation.locale, translation.slug)} hrefLang={translation.locale} className="ml-auto text-star hover:underline">
              {copy.otherLanguage}
            </Link>
          )}
        </div>
      </header>

      {post.coverUrl && !startsWithHero && (
        <figure className="mx-auto mt-10 max-w-4xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
          <img src={post.coverUrl} alt="" decoding="async" className="w-full rounded-lg border border-line object-cover" />
        </figure>
      )}

      <div className="mt-10">
        <BlogBlocks blocks={post.blocks} />
      </div>

      {post.tags.length > 0 && (
        <footer className="mx-auto mt-16 flex max-w-prose flex-wrap items-center gap-2 border-t border-line pt-6">
          <span className="mr-2 font-mono text-step-xs uppercase text-ink-3">{copy.tagsLabel}</span>
          {post.tags.map((tag) => (
            <Link key={tag} href={`${blogIndexPath(post.locale)}?tag=${encodeURIComponent(tag)}`} className="rounded-pill border border-line px-3 py-1 text-step-sm text-ink-2 hover:border-star hover:text-star">
              #{tag}
            </Link>
          ))}
        </footer>
      )}
    </article>
  );
}
