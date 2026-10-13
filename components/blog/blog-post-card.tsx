/** Summary card for the blog index. */
import React from "react";
import Link from "next/link";
import { BLOG_COPY, formatBlogDate } from "@/lib/blog/blog-copy";
import { blogIndexPath, blogPostPath } from "@/lib/blog/blog-slug-rules";
import type { BlogPostSummary } from "@/lib/blog/blog-types";

export function BlogPostCard({ post }: { post: BlogPostSummary }) {
  const copy = BLOG_COPY[post.locale];
  const href = blogPostPath(post.locale, post.slug);
  const date = formatBlogDate(post.publishedAt, post.locale);
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
      {post.coverUrl && (
        <Link href={href} tabIndex={-1} aria-hidden className="block overflow-hidden border-b border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
          <img src={post.coverUrl} alt="" loading="lazy" decoding="async" className="aspect-[16/9] w-full object-cover transition-transform duration-slow ease-expo group-hover:scale-[1.02]" />
        </Link>
      )}
      <div className="flex flex-1 flex-col p-6">
        {date && <time dateTime={post.publishedAt ?? undefined} className="font-mono text-step-xs uppercase text-ink-3">{date}</time>}
        <h2 className="mt-2 font-display text-step-lg text-ink">
          <Link href={href} className="hover:text-star focus-visible:outline-none focus-visible:underline">{post.title}</Link>
        </h2>
        {post.description && <p className="mt-2 line-clamp-3 text-step-base text-ink-2">{post.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
          {post.tags.slice(0, 4).map((tag) => (
            <Link key={tag} href={`${blogIndexPath(post.locale)}?tag=${encodeURIComponent(tag)}`} className="rounded-pill border border-line px-2.5 py-0.5 text-step-xs text-ink-3 hover:border-star hover:text-star">
              #{tag}
            </Link>
          ))}
          <Link href={href} className="ml-auto text-step-sm font-semibold text-star" aria-label={`${copy.readMore}: ${post.title}`}>
            {copy.readMore} &rarr;
          </Link>
        </div>
      </div>
    </article>
  );
}
