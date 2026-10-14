/**
 * Index cards in the Constellation card language: the latest post as a split "featured" plate and the
 * rest as `.card` lenses. Each card is one link (the title, stretched over the card with ::after), so
 * tags and author are plain text and every card is a single tab stop.
 */
import React from "react";
import Link from "next/link";
import { resolveBlogAuthor } from "@/lib/blog/blog-authors";
import { BLOG_COPY, formatBlogDate } from "@/lib/blog/blog-copy";
import { lensVariant, seedFrom, skyCoordinate } from "@/lib/blog/blog-sky-seed";
import { blogPostPath } from "@/lib/blog/blog-slug-rules";
import type { BlogPostListItem } from "@/lib/blog/blog-types";
import { cn } from "@/lib/utils";
import { BlogAuthorChip } from "./blog-author-chip";
import { BlogOrbitLens } from "./blog-orbit-lens";
import { greekMarker } from "./blog-text-blocks";

function CardLens({ post, marker, className }: { post: BlogPostListItem; marker: string; className?: string }) {
  const seed = seedFrom(post.slug);
  return (
    <div className={cn("lens", className)}>
      {post.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size
        <img src={post.coverUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <BlogOrbitLens variant={lensVariant(seed)} />
      )}
      <div className="lens-meta mono" aria-hidden="true">
        <span>{marker}</span>
        <span>{skyCoordinate(seed).split(" · ")[0]}</span>
      </div>
    </div>
  );
}

function CardMeta({ post }: { post: BlogPostListItem }) {
  const copy = BLOG_COPY[post.locale];
  const date = formatBlogDate(post.publishedAt, post.locale);
  return (
    <p className="card-meta mono">
      {date && post.publishedAt && <time dateTime={post.publishedAt}>{date}</time>}
      {date && <span aria-hidden="true">·</span>}
      <span>{copy.minutesRead(post.readingMinutes)}</span>
    </p>
  );
}

function CardTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="blog-pills">
      {tags.slice(0, 3).map((tag) => <li key={tag} className="mono">#{tag}</li>)}
    </ul>
  );
}

export function BlogPostCard({ post, index }: { post: BlogPostListItem; index: number }) {
  const copy = BLOG_COPY[post.locale];
  const author = resolveBlogAuthor(post.authorName, post.locale);
  return (
    <article className="card blog-card">
      <CardLens post={post} marker={greekMarker(index + 1)} />
      <div className="card-body">
        <CardMeta post={post} />
        <h3><Link className="blog-card-link" href={blogPostPath(post.locale, post.slug)}>{post.title}</Link></h3>
        {post.description && <p className="card-desc blog-clamp-3">{post.description}</p>}
        <CardTags tags={post.tags} />
        {author && (
          <div className="card-foot">
            <BlogAuthorChip author={author} label={copy.authorLabel} size={24} />
          </div>
        )}
      </div>
    </article>
  );
}

export function BlogFeaturedPost({ post }: { post: BlogPostListItem }) {
  const copy = BLOG_COPY[post.locale];
  const author = resolveBlogAuthor(post.authorName, post.locale);
  return (
    <article className="card blog-featured" aria-labelledby={`featured-${post.id}`}>
      <CardLens post={post} marker={greekMarker(0)} className="blog-featured-media" />
      <div className="blog-featured-body">
        <p className="mono blog-featured-kicker">
          <span className="blog-featured-dot" aria-hidden="true" />
          {copy.featuredLabel}
        </p>
        <CardMeta post={post} />
        <h2 id={`featured-${post.id}`} className="blog-featured-title">
          <Link className="blog-card-link" href={blogPostPath(post.locale, post.slug)}>{post.title}</Link>
        </h2>
        {post.description && <p className="blog-featured-desc">{post.description}</p>}
        <div className="blog-featured-foot">
          {author && <BlogAuthorChip author={author} label={copy.authorLabel} size={36} />}
          <CardTags tags={post.tags} />
        </div>
      </div>
    </article>
  );
}
