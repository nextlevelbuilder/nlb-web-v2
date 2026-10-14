/**
 * Read side of the blog: admin lookups, the public listing and revision history.
 * Callers pass the database explicitly or fall back to the request-scoped getDb().
 */
import { and, asc, desc, eq, getTableColumns, gt, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { blogPostRevisions, blogPosts } from "@/lib/db/schema";
import type { ListPostsQuery } from "./blog-post-schema";
import { revisionToWire, rowToListItem, rowToPost, rowToSummary, type BlogPostRow } from "./blog-post-mapper";
import type { BlogAdjacentPosts, BlogLocale, BlogPost, BlogPostListItem, BlogPostSummary, BlogRevision, BlogTagCount } from "./blog-types";

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

export interface PublishedListQuery {
  locale: BlogLocale;
  tag?: string;
  limit: number;
  offset: number;
}

/**
 * Published posts of one locale for the public index, newest first, each with its reading time.
 * Blocks are selected only to count words and are dropped before returning; the REST listing
 * (listPostSummaries) keeps its blocks-free shape.
 */
export async function listPublishedPostItems(query: PublishedListQuery, db: AppDb = getDb()): Promise<BlogPostListItem[]> {
  const conditions: SQL[] = [eq(blogPosts.status, "published"), eq(blogPosts.locale, query.locale)];
  if (query.tag) conditions.push(tagCondition(query.tag));
  const rows = await db
    .select()
    .from(blogPosts)
    .where(and(...conditions))
    .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
    .limit(query.limit)
    .offset(query.offset);
  return rows.map(rowToListItem);
}

/** Every tag used by published posts of a locale, most used first, then alphabetically. */
export async function listPublishedTags(locale: BlogLocale, limit = 40, db: AppDb = getDb()): Promise<BlogTagCount[]> {
  const rows = await db.all<{ tag: unknown; count: unknown }>(sql`
    select je.value as tag, count(*) as count
    from ${blogPosts}, json_each(${blogPosts.tags}) as je
    where ${blogPosts.status} = 'published' and ${blogPosts.locale} = ${locale} and je.type = 'text'
    group by je.value
    order by count desc, je.value asc
    limit ${limit}`);
  return rows
    .filter((row): row is { tag: string; count: number } => typeof row.tag === "string" && row.tag.length > 0)
    .map((row) => ({ tag: row.tag, count: Number(row.count) }));
}

/**
 * The published posts just before and after `post` in its locale, in the index order
 * (publishedAt, then id as a tie-breaker). `newer` is null for the newest post, `older` for the oldest.
 */
export async function findAdjacentPublishedPosts(post: Pick<BlogPost, "id" | "locale" | "publishedAt">, db: AppDb = getDb()): Promise<BlogAdjacentPosts> {
  if (!post.publishedAt) return { newer: null, older: null };
  const at = new Date(post.publishedAt);
  if (Number.isNaN(at.getTime())) return { newer: null, older: null };
  const scope = and(eq(blogPosts.status, "published"), eq(blogPosts.locale, post.locale), ne(blogPosts.id, post.id));
  const [newerRows, olderRows] = await Promise.all([
    db
      .select(summaryColumns)
      .from(blogPosts)
      .where(and(scope, or(gt(blogPosts.publishedAt, at), and(eq(blogPosts.publishedAt, at), gt(blogPosts.id, post.id)))))
      .orderBy(asc(blogPosts.publishedAt), asc(blogPosts.id))
      .limit(1),
    db
      .select(summaryColumns)
      .from(blogPosts)
      .where(and(scope, or(lt(blogPosts.publishedAt, at), and(eq(blogPosts.publishedAt, at), lt(blogPosts.id, post.id)))))
      .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
      .limit(1),
  ]);
  return { newer: newerRows[0] ? rowToSummary(newerRows[0]) : null, older: olderRows[0] ? rowToSummary(olderRows[0]) : null };
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
