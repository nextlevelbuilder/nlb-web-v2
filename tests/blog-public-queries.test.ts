import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "./helpers/local-d1";
import { blogPosts, users } from "@/lib/db/schema";
import { changePostStatus, createPost } from "@/lib/blog/blog-post-service";
import { findAdjacentPublishedPosts, listPostSummaries, listPublishedPostItems, listPublishedTags } from "@/lib/blog/blog-queries";

const actor = { id: "admin-1" };
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

async function publish(local: LocalD1, input: { slug: string; locale?: "en" | "vi"; tags?: string[]; wordCount?: number; at: number }) {
  const post = await createPost(
    { locale: input.locale ?? "en", slug: input.slug, title: input.slug, tags: input.tags ?? [], blocks: [{ type: "rich-text", props: { markdown: words(input.wordCount ?? 10) } }] },
    actor,
    local.db,
  );
  await changePostStatus(post.id, "publish", 1, actor, local.db);
  await local.db.update(blogPosts).set({ publishedAt: new Date(input.at) }).where(eq(blogPosts.id, post.id));
  return post.id;
}

describe("public blog queries on local D1", () => {
  let local: LocalD1;

  beforeEach(async () => {
    local = await createLocalD1();
    await local.db.insert(users).values({ id: actor.id, name: "Admin", email: "admin@example.com", role: "admin" });
  });
  afterEach(async () => {
    await local.dispose();
  });

  it("lists published items newest first with a reading time, without blocks", async () => {
    await publish(local, { slug: "short", wordCount: 10, at: 1_000, tags: ["d1"] });
    await publish(local, { slug: "long", wordCount: 1100, at: 2_000, tags: ["d1", "cli"] });
    await publish(local, { slug: "vi-post", locale: "vi", at: 3_000 });
    await createPost({ locale: "en", slug: "draft", title: "Draft", blocks: [] }, actor, local.db);

    const items = await listPublishedPostItems({ locale: "en", limit: 10, offset: 0 }, local.db);
    expect(items.map((i) => i.slug)).toEqual(["long", "short"]);
    expect(items.map((i) => i.readingMinutes)).toEqual([5, 1]);
    expect(items[0]).not.toHaveProperty("blocks");

    expect((await listPublishedPostItems({ locale: "en", tag: "cli", limit: 10, offset: 0 }, local.db)).map((i) => i.slug)).toEqual(["long"]);
    expect((await listPublishedPostItems({ locale: "en", limit: 1, offset: 1 }, local.db)).map((i) => i.slug)).toEqual(["short"]);
    // The REST listing keeps its shape: no readingMinutes, no blocks.
    const [summary] = await listPostSummaries({ status: "published", locale: "en", limit: 1, offset: 0 }, local.db);
    expect(summary).not.toHaveProperty("readingMinutes");
    expect(summary).not.toHaveProperty("blocks");
  });

  it("counts tags of published posts per locale, most used first", async () => {
    await publish(local, { slug: "a", tags: ["d1", "cli"], at: 1_000 });
    await publish(local, { slug: "b", tags: ["d1"], at: 2_000 });
    await publish(local, { slug: "c", locale: "vi", tags: ["nhật-ký"], at: 3_000 });
    await createPost({ locale: "en", slug: "draft", title: "Draft", tags: ["secret"], blocks: [] }, actor, local.db);

    expect(await listPublishedTags("en", 40, local.db)).toEqual([{ tag: "d1", count: 2 }, { tag: "cli", count: 1 }]);
    expect(await listPublishedTags("vi", 40, local.db)).toEqual([{ tag: "nhật-ký", count: 1 }]);
    expect(await listPublishedTags("en", 1, local.db)).toHaveLength(1);
  });

  it("finds newer and older neighbours in the same locale and handles first, last and ties", async () => {
    const oldest = await publish(local, { slug: "oldest", at: 1_000 });
    const middle = await publish(local, { slug: "middle", at: 2_000 });
    const newest = await publish(local, { slug: "newest", at: 3_000 });
    await publish(local, { slug: "vi-between", locale: "vi", at: 2_500 });

    const at = (ms: number) => new Date(ms).toISOString();
    const mid = await findAdjacentPublishedPosts({ id: middle, locale: "en", publishedAt: at(2_000) }, local.db);
    expect(mid.newer?.slug).toBe("newest");
    expect(mid.older?.slug).toBe("oldest");

    const first = await findAdjacentPublishedPosts({ id: newest, locale: "en", publishedAt: at(3_000) }, local.db);
    expect(first).toMatchObject({ newer: null, older: { slug: "middle" } });
    const last = await findAdjacentPublishedPosts({ id: oldest, locale: "en", publishedAt: at(1_000) }, local.db);
    expect(last).toMatchObject({ newer: { slug: "middle" }, older: null });

    // Same publish time: ordered by id, matching the index order (publishedAt desc, id desc).
    const twin = await publish(local, { slug: "twin", at: 2_000 });
    const [hi, lo] = [middle, twin].sort().reverse();
    expect((await findAdjacentPublishedPosts({ id: hi, locale: "en", publishedAt: at(2_000) }, local.db)).older?.id).toBe(lo);
    expect((await findAdjacentPublishedPosts({ id: lo, locale: "en", publishedAt: at(2_000) }, local.db)).newer?.id).toBe(hi);

    expect(await findAdjacentPublishedPosts({ id: "x", locale: "en", publishedAt: null }, local.db)).toEqual({ newer: null, older: null });
  });
});
