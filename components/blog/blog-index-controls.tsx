/** Blog index controls: the tag filter row, newer/older pagination and the empty state. */
import React from "react";
import Link from "next/link";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { blogIndexPath } from "@/lib/blog/blog-slug-rules";
import type { BlogLocale, BlogTagCount } from "@/lib/blog/blog-types";
import { blogTagHref } from "./blog-post-footer";

/** Index URL keeping the `?tag=` and `?page=` contract (page 1 and no tag are omitted). */
export function blogIndexHref(locale: BlogLocale, tag: string | undefined, page: number): string {
  const query = new URLSearchParams();
  if (tag) query.set("tag", tag);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return `${blogIndexPath(locale)}${qs ? `?${qs}` : ""}`;
}

export function BlogTagFilter({ locale, tags, active }: { locale: BlogLocale; tags: BlogTagCount[]; active?: string }) {
  const copy = BLOG_COPY[locale];
  // A valid but unused tag (e.g. from an old link) still shows as the active pill so the state is visible.
  const list = active && !tags.some((t) => t.tag === active) ? [...tags, { tag: active, count: 0 }] : tags;
  if (list.length === 0) return null;
  return (
    <nav className="blog-tags-nav" aria-label={copy.tagsNavLabel}>
      <ul className="blog-tag-list">
        <li>
          <Link className="blog-tag" href={blogIndexPath(locale)} aria-current={active ? undefined : "page"}>{copy.allTags}</Link>
        </li>
        {list.map(({ tag, count }) => (
          <li key={tag}>
            <Link className="blog-tag" href={blogTagHref(locale, tag)} aria-current={active === tag ? "page" : undefined}>
              #{tag}
              {count > 0 && <span className="blog-tag-count" aria-hidden="true">{count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function BlogPagination({ locale, tag, page, hasOlder }: { locale: BlogLocale; tag?: string; page: number; hasOlder: boolean }) {
  if (page <= 1 && !hasOlder) return null;
  const copy = BLOG_COPY[locale];
  return (
    <nav className="blog-pagination" aria-label={copy.paginationLabel}>
      {page > 1 ? (
        <Link className="btn btn-ghost btn-sm" href={blogIndexHref(locale, tag, page - 1)} rel="prev">
          <span aria-hidden="true">←</span> {copy.newer}
        </Link>
      ) : (
        <span />
      )}
      <span className="mono blog-pagination-page">{copy.pageLabel(page)}</span>
      {hasOlder ? (
        <Link className="btn btn-ghost btn-sm" href={blogIndexHref(locale, tag, page + 1)} rel="next">
          {copy.older} <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function BlogEmptyState({ locale, tag, showReset }: { locale: BlogLocale; tag?: string; showReset: boolean }) {
  const copy = BLOG_COPY[locale];
  return (
    <section className="blog-empty" aria-labelledby="blog-empty-title">
      <svg className="blog-empty-orbit" viewBox="0 0 320 160" aria-hidden="true" focusable="false">
        <ellipse className="orbit dash" cx="160" cy="80" rx="140" ry="44" />
        <ellipse className="orbit dash" cx="160" cy="80" rx="88" ry="26" transform="rotate(-10 160 80)" />
        <circle className="halo" cx="160" cy="80" r="16" />
        <circle className="core" cx="160" cy="80" r="3.5" />
        <circle className="planet" cx="40" cy="57" r="2.5" />
      </svg>
      <h2 id="blog-empty-title" className="blog-empty-title">{copy.emptyTitle}</h2>
      <p className="blog-empty-body">{tag ? copy.emptyTagBody(tag) : copy.emptyBody}</p>
      {showReset && <Link className="link-arrow" href={blogIndexPath(locale)}>{copy.clearFilter} <span aria-hidden="true">→</span></Link>}
    </section>
  );
}
