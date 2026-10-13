/** Converts blog_posts / blog_post_revisions rows into the wire types of the HTTP contract. */
import type { blogPostRevisions, blogPosts } from "@/lib/db/schema";
import type { BlogBlock } from "./blocks/block-types";
import type { BlogPost, BlogPostSummary, BlogRevision, BlogSeo } from "./blog-types";

export type BlogPostRow = typeof blogPosts.$inferSelect;
export type BlogPostSummaryRow = Omit<BlogPostRow, "blocks">;
export type BlogRevisionRow = typeof blogPostRevisions.$inferSelect;

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function rowToSummary(row: BlogPostSummaryRow): BlogPostSummary {
  return {
    id: row.id,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    // The column is NOT NULL DEFAULT ''; the contract models "no description" as null.
    description: row.description ? row.description : null,
    coverUrl: row.coverUrl ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    seo: (row.seo ?? {}) as BlogSeo,
    authorName: row.authorName ?? null,
    status: row.status,
    translationKey: row.translationKey ?? null,
    publishedAt: iso(row.publishedAt),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToPost(row: BlogPostRow): BlogPost {
  const { blocks, ...rest } = row;
  return { ...rowToSummary(rest), blocks: (Array.isArray(blocks) ? blocks : []) as BlogBlock[] };
}

/** Revision rows selected without the (large) snapshot column map to a revision without `snapshot`. */
export function revisionToWire(row: Omit<BlogRevisionRow, "snapshot"> & { snapshot?: BlogRevisionRow["snapshot"] }): BlogRevision {
  return {
    id: row.id,
    postId: row.postId,
    version: row.version,
    note: row.note ?? null,
    actorId: row.actorId || null,
    createdAt: row.createdAt.toISOString(),
    // Snapshots are written only by the blog service, always as a full BlogPost.
    ...(row.snapshot ? { snapshot: row.snapshot as unknown as BlogPost } : {}),
  };
}
