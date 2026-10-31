import { and, eq, isNull } from "drizzle-orm";
import type { Polar } from "@polar-sh/sdk";
import type { AppDb } from "@/lib/db";
import { courseVideos } from "@/lib/db/schema";
import { CourseError } from "./course-errors";
import { COURSE_VIDEO_TITLE_MAX, COURSE_VIDEO_TITLE_TOO_LONG_MESSAGE } from "./course-video-schemas";

type CourseVideoRow = typeof courseVideos.$inferSelect;

/** The slice of the Polar SDK this module calls; injectable so tests never hit the network. */
export interface CoursePolarProductsClient {
  products: Pick<Polar["products"], "create" | "update">;
}

/** Metadata stamped on every course video product so orders can be traced back to the video. */
export const COURSE_VIDEO_PRODUCT_KIND = "course_video";

/**
 * Ensure the video owns exactly one one-time Polar product and return its id.
 * Idempotent: an existing `polarProductId` is returned without calling Polar. When two publishes
 * race, the conditional update lets only one product id win; the loser archives its duplicate.
 */
export async function ensureCourseVideoPolarProduct(
  video: CourseVideoRow,
  db: AppDb,
  client: CoursePolarProductsClient
): Promise<string> {
  if (video.polarProductId) return video.polarProductId;
  // Drafts saved before the title cap would otherwise reach Polar and fail as a bare 502.
  if (video.title.length > COURSE_VIDEO_TITLE_MAX) {
    throw new CourseError(400, "title_too_long", `${COURSE_VIDEO_TITLE_TOO_LONG_MESSAGE}; shorten it before publishing`);
  }

  let productId: string;
  try {
    const product = await client.products.create({
      name: video.title,
      description: video.description || null,
      recurringInterval: null,
      prices: [{ amountType: "fixed", priceAmount: video.priceCents, priceCurrency: video.currency }],
      metadata: { kind: COURSE_VIDEO_PRODUCT_KIND, courseVideoId: video.id, slug: video.slug },
    });
    productId = product.id;
  } catch (error) {
    console.error("Polar product creation failed for course video:", {
      courseVideoId: video.id,
      error: error instanceof Error ? error.message : error,
    });
    throw new CourseError(502, "polar_product_failed", "Could not create the payment product for this video");
  }

  const [claimed] = await db
    .update(courseVideos)
    .set({ polarProductId: productId, updatedAt: new Date() })
    .where(and(eq(courseVideos.id, video.id), isNull(courseVideos.polarProductId)))
    .returning({ polarProductId: courseVideos.polarProductId });
  if (claimed?.polarProductId) return claimed.polarProductId;

  // Another request stored a product first: keep theirs and retire ours so checkout never splits.
  const [current] = await db
    .select({ polarProductId: courseVideos.polarProductId })
    .from(courseVideos)
    .where(eq(courseVideos.id, video.id))
    .limit(1);
  try {
    await client.products.update({ id: productId, productUpdate: { isArchived: true } });
  } catch (error) {
    console.error("Failed to archive duplicate Polar product; archive it manually:", {
      productId,
      error: error instanceof Error ? error.message : error,
    });
  }
  if (!current?.polarProductId) {
    throw new CourseError(409, "video_conflict", "The video changed while publishing; retry");
  }
  return current.polarProductId;
}
