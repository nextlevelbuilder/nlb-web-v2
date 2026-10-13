import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "./helpers/local-d1";
import { blogPostRevisions, blogPosts, users } from "@/lib/db/schema";
import { BlogApiError } from "@/lib/blog/blog-errors";
import { commitPostVersion } from "@/lib/blog/blog-post-commit";
import { changePostStatus, createPost, restorePostRevision, updatePost } from "@/lib/blog/blog-post-service";
import { findPostRowById, getPublishedPost, getRevision, listPostSummaries, listRevisions } from "@/lib/blog/blog-queries";

const actor = { id: "admin-1" };
const basePost = {
  locale: "en",
  slug: "hello-world",
  title: "Hello world",
  description: "First post",
  tags: ["launch", "workers"],
  blocks: [
    { type: "hero", props: { lead: "A short lead." } },
    { type: "rich-text", props: { markdown: "## Intro\n\nBody text." } },
  ],
};

async function expectApiError(promise: Promise<unknown>, status: number): Promise<BlogApiError> {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(BlogApiError);
  expect((err as BlogApiError).status).toBe(status);
  return err as BlogApiError;
}

describe("blog post service on local D1", () => {
  let local: LocalD1;

  beforeEach(async () => {
    local = await createLocalD1();
    await local.db.insert(users).values({ id: actor.id, name: "Admin", email: "admin@example.com", role: "admin" });
  });
  afterEach(async () => {
    await local.dispose();
  });

  it("creates a draft, rejects a stale update with 409, publishes and serves it publicly", async () => {
    const created = await createPost(basePost, actor, local.db);
    expect(created).toMatchObject({ status: "draft", version: 1, description: "First post", publishedAt: null });

    const updated = await updatePost(created.id, { version: 1, title: "Hello again" }, actor, local.db);
    expect(updated.version).toBe(2);
    expect(updated.title).toBe("Hello again");

    const stale = await expectApiError(updatePost(created.id, { version: 1, title: "Stale" }, actor, local.db), 409);
    expect(stale.extra.currentVersion).toBe(2);

    const published = await changePostStatus(created.id, "publish", 2, actor, local.db);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
    expect(published.version).toBe(3);

    const pub = await getPublishedPost("en", "hello-world", local.db);
    expect(pub?.title).toBe("Hello again");
    expect(pub?.blocks).toHaveLength(2);

    const unpublished = await changePostStatus(created.id, "unpublish", 3, actor, local.db);
    const republished = await changePostStatus(created.id, "publish", unpublished.version, actor, local.db);
    expect(republished.publishedAt).toBe(published.publishedAt);
  });

  it("keeps drafts and archived posts out of public reads", async () => {
    const created = await createPost(basePost, actor, local.db);
    expect(await getPublishedPost("en", "hello-world", local.db)).toBeNull();
    expect(await listPostSummaries({ status: "published", limit: 20, offset: 0 }, local.db)).toHaveLength(0);
    const drafts = await listPostSummaries({ status: "draft", limit: 20, offset: 0 }, local.db);
    expect(drafts.map((post) => post.id)).toEqual([created.id]);
    expect(drafts[0]).not.toHaveProperty("blocks");

    const published = await changePostStatus(created.id, "publish", 1, actor, local.db);
    expect(await listPostSummaries({ status: "published", tag: "workers", limit: 20, offset: 0 }, local.db)).toHaveLength(1);
    expect(await listPostSummaries({ status: "published", tag: "nope", limit: 20, offset: 0 }, local.db)).toHaveLength(0);
    await changePostStatus(created.id, "archive", published.version, actor, local.db);
    expect(await getPublishedPost("en", "hello-world", local.db)).toBeNull();
  });

  it("stores a revision per write and restores content as a new version without changing status", async () => {
    const created = await createPost(basePost, actor, local.db);
    await updatePost(created.id, { version: 1, title: "Second title", blocks: [{ type: "paragraph", props: { text: "Replaced" } }] }, actor, local.db);
    await changePostStatus(created.id, "publish", 2, actor, local.db);

    const revisions = await listRevisions(created.id, local.db);
    expect(revisions.map((r) => r.version)).toEqual([3, 2, 1]);
    expect(revisions.map((r) => r.note)).toEqual(["published", "updated", "created"]);
    expect(revisions[0]).not.toHaveProperty("snapshot");

    const first = await getRevision(created.id, revisions[2].id, local.db);
    expect(first?.snapshot?.title).toBe("Hello world");

    const restored = await restorePostRevision(created.id, revisions[2].id, 3, actor, local.db);
    expect(restored).toMatchObject({ version: 4, title: "Hello world", status: "published" });
    expect(restored.blocks).toHaveLength(2);
    const latest = await listRevisions(created.id, local.db);
    expect(latest[0]).toMatchObject({ version: 4, note: "restored version 1" });
    const snapshot = (await getRevision(created.id, latest[0].id, local.db))?.snapshot;
    expect(snapshot).toEqual(restored);

    await expectApiError(restorePostRevision(created.id, "missing", 4, actor, local.db), 404);
  });

  it("writes nothing when a concurrent writer already advanced the version", async () => {
    const created = await createPost(basePost, actor, local.db);
    const staleRow = await findPostRowById(created.id, local.db);
    await updatePost(created.id, { version: 1, title: "Winner" }, actor, local.db);
    const err = await expectApiError(commitPostVersion(staleRow!, { title: "Loser" }, actor, "updated", local.db), 409);
    expect(err.extra.currentVersion).toBe(2);
    const [row] = await local.db.select().from(blogPosts).where(eq(blogPosts.id, created.id));
    expect(row.title).toBe("Winner");
    const revisions = await local.db.select().from(blogPostRevisions).where(eq(blogPostRevisions.postId, created.id));
    expect(revisions.map((r) => r.version).sort()).toEqual([1, 2]);
  });

  it("enforces unique (locale, slug), translation slots and validation", async () => {
    const created = await createPost({ ...basePost, translationKey: "hello" }, actor, local.db);
    await expectApiError(createPost(basePost, actor, local.db), 409);
    await createPost({ ...basePost, locale: "vi", translationKey: "hello" }, actor, local.db);
    await expectApiError(createPost({ ...basePost, slug: "other", translationKey: "hello" }, actor, local.db), 409);
    const other = await createPost({ ...basePost, slug: "second" }, actor, local.db);
    await expectApiError(updatePost(other.id, { version: 1, slug: created.slug }, actor, local.db), 409);

    const invalid = await expectApiError(createPost({ ...basePost, slug: "Bad Slug", blocks: [{ type: "nope", props: {} }] }, actor, local.db), 400);
    expect(invalid.extra.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: "slug" })]));
    const badBlock = await expectApiError(createPost({ ...basePost, slug: "x", blocks: [{ type: "nope", props: {} }] }, actor, local.db), 400);
    expect(badBlock.extra.details).toEqual([expect.objectContaining({ path: "blocks.0.type" })]);
    await expectApiError(updatePost(other.id, { version: 1 }, actor, local.db), 400);
    await expectApiError(updatePost("missing", { version: 1, title: "x" }, actor, local.db), 404);
  });
});
