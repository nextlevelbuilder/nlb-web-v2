import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courseVideos } from "@/lib/db/schema";
import { ensureCourseVideoPolarProduct, type CoursePolarProductsClient } from "@/lib/courses/course-polar-product";
import { createVideo, publishVideo, updateVideo } from "@/lib/courses/course-video-service";
import { CourseError } from "@/lib/courses/course-errors";
import type { StreamVideoClient } from "@/lib/courses/stream-video-api";

let seq = 0;

function mockPolarClient(productId = "polar-prod-1") {
  const create = vi.fn().mockResolvedValue({ id: productId });
  const update = vi.fn().mockResolvedValue({ id: productId });
  // Only `create`/`update` are exercised; the cast narrows the SDK's full Product return type.
  const client = { products: { create, update } } as unknown as CoursePolarProductsClient;
  return { client, create, update };
}

/** Stream API stand-in: records which uids were marked signed-only. */
function mockStream() {
  const requireSignedUrls = vi.fn<(uid: string) => Promise<void>>().mockResolvedValue(undefined);
  const client: StreamVideoClient = { requireSignedUrls };
  return { client, requireSignedUrls };
}

let stream = mockStream();

async function draftVideo(streamUid: string | null = "abcdefabcdefabcdefabcdefabcdefab") {
  seq += 1;
  return createVideo(
    { slug: `lesson-${seq}`, title: `Lesson ${seq}`, description: "Intro", locale: "en", durationSec: 600, priceCents: 2500, currency: "usd", streamUid },
    getDb(),
    stream.client
  );
}

describe("course video publish and Polar product", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stream = mockStream();
  });

  it("creates one one-time product with course metadata, then publishes", async () => {
    const video = await draftVideo();
    const { client, create } = mockPolarClient("polar-prod-a");

    const published = await publishVideo(video.slug, getDb(), client, stream.client);

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
    await publishVideo(video.slug, getDb(), client, stream.client);
    const again = await publishVideo(video.slug, getDb(), client, stream.client);
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
    await expect(publishVideo(video.slug, getDb(), client, stream.client)).rejects.toMatchObject({ status: 422 });
    expect(create).not.toHaveBeenCalled();
  });

  it("maps Polar failures to 502 and keeps the video unpublished", async () => {
    const video = await draftVideo();
    const { client, create } = mockPolarClient();
    create.mockRejectedValueOnce(new Error("polar down"));
    await expect(publishVideo(video.slug, getDb(), client, stream.client)).rejects.toMatchObject({ status: 502 });
    const [row] = await getDb().select().from(courseVideos).where(eq(courseVideos.id, video.id));
    expect(row).toMatchObject({ status: "draft", polarProductId: null });
  });

  it("locks the price once the Polar product exists", async () => {
    const video = await draftVideo();
    await updateVideo(video.slug, { priceCents: 3000 }, getDb(), stream.client);
    await publishVideo(video.slug, getDb(), mockPolarClient("polar-prod-c").client, stream.client);
    await expect(updateVideo(video.slug, { priceCents: 4000 }, getDb(), stream.client)).rejects.toMatchObject({ status: 409, code: "price_locked" });
  });

  it("marks the uid signed-only on Stream when it is registered and again on publish", async () => {
    const video = await draftVideo("1234567890abcdef1234567890abcdef");
    expect(stream.requireSignedUrls).toHaveBeenCalledWith("1234567890abcdef1234567890abcdef");
    expect(video.streamSignedOnly).toBe(true);

    const published = await publishVideo(video.slug, getDb(), mockPolarClient("polar-prod-d").client, stream.client);
    expect(stream.requireSignedUrls).toHaveBeenCalledTimes(2);
    expect(published.streamSignedOnly).toBe(true);
  });

  it("does not store a uid Stream refused to make signed-only", async () => {
    stream.requireSignedUrls.mockRejectedValueOnce(new CourseError(502, "stream_not_signed_only", "no"));
    await expect(draftVideo()).rejects.toMatchObject({ status: 502, code: "stream_not_signed_only" });
  });

  it("keeps the video unpublished and Polar untouched when Stream enforcement fails on publish", async () => {
    const video = await draftVideo();
    const { client, create } = mockPolarClient();
    stream.requireSignedUrls.mockRejectedValueOnce(new CourseError(502, "stream_unavailable", "down"));
    await expect(publishVideo(video.slug, getDb(), client, stream.client)).rejects.toMatchObject({ status: 502 });
    expect(create).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(courseVideos).where(eq(courseVideos.id, video.id));
    expect(row.status).toBe("draft");
  });

  it("re-registers a changed uid and clears the flag when the uid is removed", async () => {
    const video = await draftVideo(null);
    expect(video.streamSignedOnly).toBe(false);
    const withUid = await updateVideo(video.slug, { streamUid: "fedcba9876543210fedcba9876543210" }, getDb(), stream.client);
    expect(stream.requireSignedUrls).toHaveBeenCalledWith("fedcba9876543210fedcba9876543210");
    expect(withUid.streamSignedOnly).toBe(true);
    const cleared = await updateVideo(video.slug, { streamUid: null }, getDb(), stream.client);
    expect(cleared.streamSignedOnly).toBe(false);
  });

  it("refuses to register a uid when the Stream API is not configured (503)", async () => {
    vi.stubEnv("CF_STREAM_API_TOKEN", "");
    seq += 1;
    await expect(
      createVideo({ slug: `lesson-${seq}`, title: "L", description: "", locale: "en", durationSec: 0, priceCents: 2500, currency: "usd", streamUid: "abcdefabcdefabcdefabcdefabcdefab" }, getDb())
    ).rejects.toMatchObject({ status: 503, code: "stream_not_configured" });
    vi.unstubAllEnvs();
  });
});
