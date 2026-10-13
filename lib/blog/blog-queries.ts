/**
 * Read side of the blog: admin lookups, the public listing and revision history.
 * Callers pass the database explicitly or fall back to the request-scoped getDb().
 */
import { and, desc, eq, getTableColumns, ne, sql, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { blogPostRevisions, blogPosts } from "@/lib/db/schema";
import type { ListPostsQuery } from "./blog-post-schema";
import { revisionToWire, rowToPost, rowToSummary, type BlogPostRow } from "./blog-post-mapper";
import type { BlogLocale, BlogPost, BlogPostSummary, BlogRevision } from "./blog-types";

/** Copy of a column map without one column (drizzle selects take a plain object of columns). */
function withoutColumn<T extends Record<string, unknown>, K extends keyof T>(columns: T, key: K): Omit<T, K> {
  const copy = { ...columns };
  delete copy[key];
  return copy;
}

const summaryColumns = withoutColumn(getTableColumns(blogPosts), "blocks");

export async function findPostRowById(id: string, db: AppDb = getDb()): Promise<BlogPostRow | null> {
  const [row] = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return row ?? null;
}

/**
 * Resolves `{idOrSlug}`: an exact id match first, then the slug in the requested locale (or in
 * either locale, English first, when none is given). Returns every slug candidate so the caller
 * can apply visibility rules before choosing.
 */
export async function findPostCandidates(idOrSlug: string, locale: BlogLocale | undefined, db: AppDb = getDb()): Promise<BlogPostRow[]> {
  const byId = await findPostRowById(idOrSlug, db);
  if (byId && (!locale || byId.locale === locale)) return [byId];
  const where = locale ? and(eq(blogPosts.slug, idOrSlug), eq(blogPosts.locale, locale)) : eq(blogPosts.slug, idOrSlug);
  const rows = await db.select().from(blogPosts).where(where).limit(2);
  return rows.sort((a, b) => (a.locale === b.locale ? 0 : a.locale === "en" ? -1 : 1));
}

function tagCondition(tag: string): SQL {
  return sql`exists (select 1 from json_each(${blogPosts.tags}) where json_each.value = ${tag})`;
}

/** Lists post summaries (no blocks). Published lists sort by publishedAt; others by last update. */
export async function listPostSummaries(query: ListPostsQuery, db: AppDb = getDb()): Promise<BlogPostSummary[]> {
  const conditions: SQL[] = [];
  if (query.status !== "all") conditions.push(eq(blogPosts.status, query.status));
  if (query.locale) conditions.push(eq(blogPosts.locale, query.locale));
  if (query.tag) conditions.push(tagCondition(query.tag));
  const order = query.status === "published" ? [desc(blogPosts.publishedAt), desc(blogPosts.id)] : [desc(blogPosts.updatedAt), desc(blogPosts.id)];
  const rows = await db
    .select(summaryColumns)
    .from(blogPosts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...order)
    .limit(query.limit)
    .offset(query.offset);
  return rows.map(rowToSummary);
}

export async function getPublishedPost(locale: BlogLocale, slug: string, db: AppDb = getDb()): Promise<BlogPost | null> {
  const [row] = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.locale, locale), eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
    .limit(1);
  return row ? rowToPost(row) : null;
}

/** The published post in another locale sharing this translation key (for hreflang). */
export async function findPublishedTranslation(post: Pick<BlogPost, "id" | "locale" | "translationKey">, db: AppDb = getDb()): Promise<BlogPostSummary | null> {
  if (!post.translationKey) return null;
  const [row] = await db
    .select(summaryColumns)
    .from(blogPosts)
    .where(and(eq(blogPosts.translationKey, post.translationKey), ne(blogPosts.locale, post.locale), eq(blogPosts.status, "published"), ne(blogPosts.id, post.id)))
    .limit(1);
  return row ? rowToSummary(row) : null;
}

/** Another post (any status) in `locale` that already uses `translationKey`. */
export async function findTranslationClash(translationKey: string, locale: BlogLocale, excludeId: string, db: AppDb = getDb()): Promise<string | null> {
  const [row] = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(and(eq(blogPosts.translationKey, translationKey), eq(blogPosts.locale, locale), ne(blogPosts.id, excludeId)))
    .limit(1);
  return row?.id ?? null;
}

export async function listRevisions(postId: string, db: AppDb = getDb()): Promise<BlogRevision[]> {
  const columns = withoutColumn(getTableColumns(blogPostRevisions), "snapshot");
  const rows = await db
    .select(columns)
    .from(blogPostRevisions)
    .where(eq(blogPostRevisions.postId, postId))
    .orderBy(desc(blogPostRevisions.version), desc(blogPostRevisions.createdAt));
  return rows.map((row) => revisionToWire(row));
}

export async function getRevision(postId: string, revisionId: string, db: AppDb = getDb()): Promise<BlogRevision | null> {
  const [row] = await db
    .select()
    .from(blogPostRevisions)
    .where(and(eq(blogPostRevisions.id, revisionId), eq(blogPostRevisions.postId, postId)))
    .limit(1);
  return row ? revisionToWire(row) : null;
}
