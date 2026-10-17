/**
 * Atomic blog writes. D1 has no interactive transactions, so each write is one `db.batch([...])`:
 * the post statement plus a revision snapshot of the resulting post. Updates are guarded by
 * `WHERE id = ? AND version = ?`; the revision insert is conditional on `changes() = 1`, i.e. on that
 * update having modified the row in the same batch, so a lost race writes nothing and surfaces as 409.
 */
import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { blogPostRevisions, blogPosts } from "@/lib/db/schema";
import { conflict, isUniqueViolation, notFound, versionConflict } from "./blog-errors";
import { rowToPost, type BlogPostRow } from "./blog-post-mapper";
import { findPostRowById } from "./blog-queries";
import type { BlogPost } from "./blog-types";

export interface BlogActor {
  id: string;
}

/** Column values a write may change (everything except identity, version and timestamps). */
export type BlogPostChanges = Partial<Omit<BlogPostRow, "id" | "version" | "createdAt" | "updatedAt" | "authorId">>;

function rethrowUnique(err: unknown, row: Pick<BlogPostRow, "slug" | "locale">): never {
  if (isUniqueViolation(err)) throw conflict(`A post with slug "${row.slug}" already exists in locale "${row.locale}".`);
  throw err;
}

/** Inserts a new post (version 1) and its first revision in one batch. */
export async function insertPostWithRevision(row: BlogPostRow, actor: BlogActor, db: AppDb): Promise<BlogPost> {
  const post = rowToPost(row);
  try {
    await db.batch([
      db.insert(blogPosts).values(row),
      db.insert(blogPostRevisions).values({
        id: crypto.randomUUID(),
        postId: row.id,
        version: row.version,
        snapshot: post as unknown as Record<string, unknown>,
        actorId: actor.id,
        note: "created",
        createdAt: row.createdAt,
      }),
    ]);
  } catch (err) {
    rethrowUnique(err, row);
  }
  return post;
}

/**
 * Commits `changes` over `current` as version + 1 together with a revision snapshot.
 * Throws 409 with the current version when another writer got there first.
 */
export async function commitPostVersion(current: BlogPostRow, changes: BlogPostChanges, actor: BlogActor, note: string, db: AppDb): Promise<BlogPost> {
  const version = current.version + 1;
  const updatedAt = new Date();
  const snapshot = rowToPost({ ...current, ...changes, version, updatedAt });
  const revisionId = crypto.randomUUID();

  let updated: BlogPostRow[];
  try {
    [updated] = await db.batch([
      db
        .update(blogPosts)
        .set({ ...changes, version, updatedAt })
        .where(and(eq(blogPosts.id, current.id), eq(blogPosts.version, current.version)))
        .returning(),
      // Values follow the table's column order (id, post_id, version, snapshot, actor_id, note, created_at).
      // A raw `db.run(sql)` with parameters is not batchable in drizzle's D1 driver; insert-select is.
      db.insert(blogPostRevisions).select(
        sql`select ${revisionId}, ${current.id}, ${version}, ${JSON.stringify(snapshot)}, ${actor.id}, ${note}, ${updatedAt.getTime()} where changes() = 1`
      ),
    ]);
  } catch (err) {
    rethrowUnique(err, { slug: changes.slug ?? current.slug, locale: changes.locale ?? current.locale });
  }

  const [row] = updated;
  if (!row) {
    const fresh = await findPostRowById(current.id, db);
    if (!fresh) throw notFound();
    throw versionConflict(fresh.version);
  }
  return rowToPost(row);
}
