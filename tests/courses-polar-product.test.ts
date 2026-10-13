import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courseVideos } from "@/lib/db/schema";
import { ensureCourseVideoPolarProduct, type CoursePolarProductsClient } from "@/lib/courses/course-polar-product";
import { createVideo, publishVideo, updateVideo } from "@/lib/courses/course-video-service";

let seq = 0;

function mockPolarClient(productId = "polar-prod-1") {
  const create = vi.fn().mockResolvedValue({ id: productId });
  const update = vi.fn().mockResolvedValue({ id: productId });
  // Only `create`/`update` are exercised; the cast narrows the SDK's full Product return type.
  const client = { products: { create, update } } as unknown as CoursePolarProductsClient;
  return { client, create, update };
}

async function draftVideo(streamUid: string | null = "abcdefabcdefabcdefabcdefabcdefab") {
  seq += 1;
  return createVideo(
    { slug: `lesson-${seq}`, title: `Lesson ${seq}`, description: "Intro", locale: "en", durationSec: 600, priceCents: 2500, currency: "usd", streamUid },
    getDb()
  );
}

describe("course video publish and Polar product", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates one one-time product with course metadata, then publishes", async () => {
    const video = await draftVideo();
    const { client, create } = mockPolarClient("polar-prod-a");

    const published = await publishVideo(video.slug, getDb(), client);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: video.title,
        recurringInterval: null,
        prices: [{ amountType: "fixed", priceAmount: 2500, priceCurrency: "usd" }],
        metadata: expect.objectContaining({ kind: "course_video", courseVideoId: video.id }),
      })
    );
    expect(published).toMatchObject({ status: "published", polarProductId: "polar-prod-a" });
    expect(published.publishedAt).toBeInstanceOf(Date);
  });

  it("is idempotent: publishing again never creates a second product", async () => {
    const video = await draftVideo();
    const { client, create } = mockPolarClient("polar-prod-b");
    await publishVideo(video.slug, getDb(), client);
    const again = await publishVideo(video.slug, getDb(), client);
    expect(create).toHaveBeenCalledTimes(1);
    expect(again.polarProductId).toBe("polar-prod-b");
  });

  it("keeps the stored product and archives the duplicate when a concurrent publish won", async () => {
    const video = await draftVideo();
    const { client, update } = mockPolarClient("polar-prod-late");
    // Simulate another request storing its product after we read the row but before we write.
    await getDb().update(courseVideos).set({ polarProductId: "polar-prod-winner" }).where(eq(courseVideos.id, video.id));

    const id = await ensureCourseVideoPolarProduct(video, getDb(), client);

    expect(id).toBe("polar-prod-winner");
    expect(update).toHaveBeenCalledWith({ id: "polar-prod-late", productUpdate: { isArchived: true } });
  });

  it("refuses to publish without a Stream uid and leaves Polar untouched", async () => {
    const video = await draftVideo(null);
    const { client, create } = mockPolarClient();
    await expect(publishVideo(video.slug, getDb(), client)).rejects.toMatchObject({ status: 422 });
    expect(create).not.toHaveBeenCalled();
  });

  it("maps Polar failures to 502 and keeps the video unpublished", async () => {
    const video = await draftVideo();
    const { client, create } = mockPolarClient();
    create.mockRejectedValueOnce(new Error("polar down"));
    await expect(publishVideo(video.slug, getDb(), client)).rejects.toMatchObject({ status: 502 });
    const [row] = await getDb().select().from(courseVideos).where(eq(courseVideos.id, video.id));
    expect(row).toMatchObject({ status: "draft", polarProductId: null });
  });

  it("locks the price once the Polar product exists", async () => {
    const video = await draftVideo();
    await updateVideo(video.slug, { priceCents: 3000 }, getDb());
    await publishVideo(video.slug, getDb(), mockPolarClient("polar-prod-c").client);
    await expect(updateVideo(video.slug, { priceCents: 4000 }, getDb())).rejects.toMatchObject({ status: 409, code: "price_locked" });
  });
});
