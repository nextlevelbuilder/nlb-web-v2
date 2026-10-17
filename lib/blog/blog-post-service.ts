/**
 * Write side of the blog, shared by the REST API (and through it the CLI and MCP tools).
 * Every write validates through the post schema and block registry, checks the optimistic
 * `version`, and commits the row plus a revision snapshot in one D1 batch (blog-post-commit.ts).
 */
import { getDb, type AppDb } from "@/lib/db";
import { validateBlocks } from "./blocks/registry";
import type { BlogBlock } from "./blocks/block-types";
import { conflict, notFound, payloadTooLarge, validationFailed, versionConflict, badRequest } from "./blog-errors";
import { commitPostVersion, insertPostWithRevision, type BlogActor, type BlogPostChanges } from "./blog-post-commit";
import { rowToPost, type BlogPostRow } from "./blog-post-mapper";
import { createPostSchema, patchPostSchema, zodIssues, type CreatePostInput } from "./blog-post-schema";
import { findPostRowById, findTranslationClash, getRevision } from "./blog-queries";
import type { BlogLocale, BlogPost, BlogSeo } from "./blog-types";

export type { BlogActor } from "./blog-post-commit";

/** The full editable state of a post before block validation. */
interface EditableState {
  locale: BlogLocale;
  slug: string;
  title: string;
  description: string | null;
  blocks: unknown;
  coverUrl: string | null;
  tags: string[];
  seo: BlogSeo;
  translationKey: string | null;
  authorName: string | null;
}

/** Validates blocks (413 for the size limit, 400 otherwise) and the translation slot; returns column values. */
async function prepareState(state: EditableState, postId: string, db: AppDb): Promise<BlogPostChanges & { blocks: BlogBlock[] }> {
  const result = validateBlocks(state.blocks);
  if (!result.ok) {
    if (result.tooLarge) throw payloadTooLarge(result.issues[0].message, result.issues);
    throw validationFailed(result.issues);
  }
  if (state.translationKey) {
    const clash = await findTranslationClash(state.translationKey, state.locale, postId, db);
    if (clash) throw conflict(`Translation key "${state.translationKey}" already has a ${state.locale} post (${clash}).`);
  }
  return {
    locale: state.locale,
    slug: state.slug,
    title: state.title,
    description: state.description ?? "",
    blocks: result.blocks,
    coverUrl: state.coverUrl,
    tags: state.tags,
    seo: state.seo as Record<string, string | boolean>,
    translationKey: state.translationKey,
    authorName: state.authorName,
  };
}

function stateFromInput(input: CreatePostInput, locale: BlogLocale): EditableState {
  return {
    locale,
    slug: input.slug,
    title: input.title,
    description: input.description ?? null,
    blocks: input.blocks,
    coverUrl: input.coverUrl ?? null,
    tags: input.tags ?? [],
    seo: input.seo ?? {},
    translationKey: input.translationKey ?? null,
    authorName: input.authorName ?? null,
  };
}

function stateOf(row: BlogPostRow): EditableState {
  return {
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    description: row.description || null,
    blocks: row.blocks,
    coverUrl: row.coverUrl ?? null,
    tags: row.tags ?? [],
    seo: (row.seo ?? {}) as BlogSeo,
    translationKey: row.translationKey ?? null,
    authorName: row.authorName ?? null,
  };
}

async function requirePost(id: string, db: AppDb): Promise<BlogPostRow> {
  const row = await findPostRowById(id, db);
  if (!row) throw notFound();
  return row;
}

function checkVersion(current: BlogPostRow, expected: number): void {
  if (current.version !== expected) throw versionConflict(current.version);
}

export async function createPost(raw: unknown, actor: BlogActor, db: AppDb = getDb()): Promise<BlogPost> {
  const parsed = createPostSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed(zodIssues(parsed.error));
  const id = crypto.randomUUID();
  const columns = await prepareState(stateFromInput(parsed.data, parsed.data.locale), id, db);
  const now = new Date();
  const row: BlogPostRow = {
    id,
    locale: parsed.data.locale,
    slug: parsed.data.slug,
    title: parsed.data.title,
    description: columns.description ?? "",
    blocks: columns.blocks,
    coverUrl: columns.coverUrl ?? null,
    tags: columns.tags ?? [],
    seo: columns.seo ?? {},
    authorId: actor.id,
    authorName: columns.authorName ?? null,
    status: "draft",
    translationKey: columns.translationKey ?? null,
    publishedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return insertPostWithRevision(row, actor, db);
}

export async function updatePost(id: string, raw: unknown, actor: BlogActor, db: AppDb = getDb()): Promise<BlogPost> {
  const parsed = patchPostSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed(zodIssues(parsed.error));
  const { version, ...patch } = parsed.data;
  const current = await requirePost(id, db);
  checkVersion(current, version);
  const base = stateOf(current);
  const next: EditableState = {
    locale: patch.locale ?? base.locale,
    slug: patch.slug ?? base.slug,
    title: patch.title ?? base.title,
    description: patch.description === undefined ? base.description : patch.description,
    blocks: patch.blocks === undefined ? base.blocks : patch.blocks,
    coverUrl: patch.coverUrl === undefined ? base.coverUrl : patch.coverUrl,
    tags: patch.tags ?? base.tags,
    seo: patch.seo ?? base.seo,
    translationKey: patch.translationKey === undefined ? base.translationKey : patch.translationKey,
    authorName: patch.authorName === undefined ? base.authorName : patch.authorName,
  };
  const changes = await prepareState(next, current.id, db);
  return commitPostVersion(current, changes, actor, "updated", db);
}

export type StatusAction = "publish" | "unpublish" | "archive";
const TARGET_STATUS = { publish: "published", unpublish: "draft", archive: "archived" } as const;
const ACTION_NOTE = { publish: "published", unpublish: "unpublished", archive: "archived" } as const;

/**
 * Publishes, unpublishes or archives. publishedAt is set on first publish and kept afterwards, so a
 * republished post keeps its original date. Requesting the status a post already has is a no-op.
 */
export async function changePostStatus(id: string, action: StatusAction, expectedVersion: number, actor: BlogActor, db: AppDb = getDb()): Promise<BlogPost> {
  const current = await requirePost(id, db);
  checkVersion(current, expectedVersion);
  const status = TARGET_STATUS[action];
  if (current.status === status) return rowToPost(current);
  if (action === "publish") {
    const blocks = validateBlocks(current.blocks);
    if (!blocks.ok) throw validationFailed(blocks.issues);
  }
  const publishedAt = action === "publish" ? (current.publishedAt ?? new Date()) : current.publishedAt;
  return commitPostVersion(current, { status, publishedAt }, actor, ACTION_NOTE[action], db);
}

/** Restores a revision's content as a new version. Locale and status stay as they are now. */
export async function restorePostRevision(id: string, revisionId: string, expectedVersion: number, actor: BlogActor, db: AppDb = getDb()): Promise<BlogPost> {
  const current = await requirePost(id, db);
  checkVersion(current, expectedVersion);
  const revision = await getRevision(current.id, revisionId, db);
  if (!revision?.snapshot) throw notFound("Revision not found");
  const snap = revision.snapshot;
  const parsed = createPostSchema.safeParse({
    locale: current.locale,
    slug: snap.slug,
    title: snap.title,
    description: snap.description,
    blocks: snap.blocks,
    coverUrl: snap.coverUrl,
    tags: snap.tags,
    seo: snap.seo,
    translationKey: snap.translationKey,
    authorName: snap.authorName,
  });
  if (!parsed.success) throw badRequest("Revision content is no longer valid", zodIssues(parsed.error));
  const changes = await prepareState(stateFromInput(parsed.data, current.locale), current.id, db);
  return commitPostVersion(current, changes, actor, `restored version ${revision.version}`, db);
}
