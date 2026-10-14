/**
 * Article layout for a published post: masthead (plate, h1, lede, meta), cover, blocks on the article
 * grid, then tags, share, author card and newer/older navigation. A leading hero block is lifted into
 * the masthead: its lead is the lede, its eyebrow the plate name and its image the cover.
 */
import React from "react";
import Link from "next/link";
import { getBlockSchema, type BlogBlockProps } from "@/lib/blog/blocks/registry";
import type { BlogBlock } from "@/lib/blog/blocks/block-types";
import { resolveBlogAuthor } from "@/lib/blog/blog-authors";
import { BLOG_COPY, formatBlogDate } from "@/lib/blog/blog-copy";
import { readingMinutes } from "@/lib/blog/blog-reading-time";
import { blogPostPublicUrl } from "@/lib/blog/blog-share-links";
import { seedFrom, skyCoordinate } from "@/lib/blog/blog-sky-seed";
import { blogIndexPath, blogPostPath } from "@/lib/blog/blog-slug-rules";
import type { BlogAdjacentPosts, BlogPost, BlogPostSummary } from "@/lib/blog/blog-types";
import { BlogAuthorChip } from "./blog-author-chip";
import { BlogBlocks } from "./blog-block-renderers";
import { BLOG_NUMERAL, BlogPlate } from "./blog-plate";
import { BlogPostFooter } from "./blog-post-footer";

const NO_ADJACENT: BlogAdjacentPosts = { newer: null, older: null };

/** Splits off a valid leading hero block; an invalid stored hero is dropped like any invalid block. */
function splitHero(blocks: BlogBlock[]): { hero: BlogBlockProps<"hero"> | null; body: BlogBlock[] } {
  if (blocks[0]?.type !== "hero") return { hero: null, body: blocks };
  const parsed = getBlockSchema("hero").safeParse(blocks[0].props);
  return { hero: parsed.success ? (parsed.data as BlogBlockProps<"hero">) : null, body: blocks.slice(1) };
}

interface BlogPostLayoutProps {
  post: BlogPost;
  translation: BlogPostSummary | null;
  adjacent?: BlogAdjacentPosts;
}

export function BlogPostLayout({ post, translation, adjacent = NO_ADJACENT }: BlogPostLayoutProps) {
  const copy = BLOG_COPY[post.locale];
  const date = formatBlogDate(post.publishedAt, post.locale);
  const author = resolveBlogAuthor(post.authorName, post.locale);
  const { hero, body } = splitHero(post.blocks);
  const kicker = hero?.eyebrow || post.tags[0] || copy.plateName;
  const lede = hero?.lead ?? post.description;
  const cover = hero?.image ?? (post.coverUrl ? { src: post.coverUrl, alt: "", caption: undefined } : null);

  return (
    <article lang={post.locale} className="blog-article">
      <header className="blog-post-head">
        <Link className="mono blog-back" href={blogIndexPath(post.locale)}>
          <span aria-hidden="true">← </span>{copy.backToBlog}
        </Link>
        <BlogPlate numeral={BLOG_NUMERAL} name={kicker} coord={skyCoordinate(seedFrom(post.slug))} />
        <h1 className="h1-page blog-title">{post.title}</h1>
        {lede && <p className="lede blog-lede">{lede}</p>}
        <ul className="mono blog-meta">
          {author && <li className="blog-meta-author"><BlogAuthorChip author={author} label={copy.authorLabel} /></li>}
          {date && post.publishedAt && <li><time dateTime={post.publishedAt}>{date}</time></li>}
          <li>{copy.minutesRead(readingMinutes(post.blocks))}</li>
          {translation && (
            <li className="blog-meta-lang">
              <Link href={blogPostPath(translation.locale, translation.slug)} hrefLang={translation.locale} lang={translation.locale}>
                {copy.otherLanguage} <span aria-hidden="true">→</span>
              </Link>
            </li>
          )}
        </ul>
      </header>

      {cover && (
        <figure className="blog-cover">
          <div className="blog-cover-frame">
            {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
            <img src={cover.src} alt={cover.alt} decoding="async" fetchPriority="high" />
          </div>
          {cover.caption && <figcaption className="mono">{cover.caption}</figcaption>}
        </figure>
      )}

      <BlogBlocks blocks={body} locale={post.locale} />

      <BlogPostFooter
        locale={post.locale}
        title={post.title}
        tags={post.tags}
        publicUrl={blogPostPublicUrl(post.locale, post.slug)}
        author={author}
        adjacent={adjacent}
      />
    </article>
  );
}
