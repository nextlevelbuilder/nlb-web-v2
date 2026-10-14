/** Wire types of the blog HTTP contract (plans/261013-1759-nlb-web-v2-build/phase-05-blog-api-contract.md). */
import type { BlogBlock } from "./blocks/block-types";

export const BLOG_LOCALES = ["en", "vi"] as const;
export const BLOG_STATUSES = ["draft", "published", "archived"] as const;

export type BlogLocale = (typeof BLOG_LOCALES)[number];
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export interface BlogSeo {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}

export interface BlogPost {
  id: string;
  locale: BlogLocale;
  slug: string;
  title: string;
  description: string | null;
  blocks: BlogBlock[];
  coverUrl: string | null;
  tags: string[];
  seo: BlogSeo;
  authorName: string | null;
  status: BlogStatus;
  translationKey: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type BlogPostSummary = Omit<BlogPost, "blocks">;

/** A summary for the public index cards: reading time is computed from the blocks, which are then dropped. */
export interface BlogPostListItem extends BlogPostSummary {
  readingMinutes: number;
}

/** A tag used by published posts of one locale, with how many posts carry it. */
export interface BlogTagCount {
  tag: string;
  count: number;
}

/** Published neighbours of a post in its locale, by publish date. */
export interface BlogAdjacentPosts {
  newer: BlogPostSummary | null;
  older: BlogPostSummary | null;
}

export interface BlogRevision {
  id: string;
  postId: string;
  version: number;
  note: string | null;
  actorId: string | null;
  createdAt: string;
  snapshot?: BlogPost;
}

export function isBlogLocale(value: unknown): value is BlogLocale {
  return typeof value === "string" && (BLOG_LOCALES as readonly string[]).includes(value);
}
