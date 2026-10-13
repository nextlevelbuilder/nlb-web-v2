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
