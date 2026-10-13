import type { Polar } from "@polar-sh/sdk";
import { env } from "@/lib/env";
import { localizedPath } from "@/lib/seo";
import { CourseError } from "./course-errors";
import { COURSE_VIDEO_PRODUCT_KIND } from "./course-polar-product";
import type { CourseVideoRow } from "./course-video-service";

export interface CoursePolarCheckoutsClient {
  checkouts: Pick<Polar["checkouts"], "create">;
}

export interface CourseCheckoutBuyer {
  id: string;
  email: string;
}

/** Locale-aware path to the video page; the default locale (vi) has no prefix. */
export function courseVideoPath(slug: string, locale?: "en" | "vi"): string {
  return localizedPath(`/courses/${encodeURIComponent(slug)}`, locale ?? "vi");
}

/**
 * Create a Polar checkout for one course video, bound to the signed-in buyer's email so the
 * resulting order maps to their account. Metadata mirrors app/api/checkout conventions and adds the
 * course identifiers the webhook uses to grant the `video:<id>` entitlement.
 */
export async function createCourseVideoCheckout(
  video: CourseVideoRow,
  buyer: CourseCheckoutBuyer,
  client: CoursePolarCheckoutsClient,
  locale?: "en" | "vi"
): Promise<{ url: string }> {
  if (video.status !== "published" || !video.polarProductId) {
    throw new CourseError(404, "video_not_found", "Video not found");
  }
  const successUrl = `${env.NEXT_PUBLIC_APP_URL}${courseVideoPath(video.slug, locale)}?payment=success&session_id={CHECKOUT_ID}`;

  let checkoutUrl: string | undefined;
  try {
    const checkout = await client.checkouts.create({
      products: [video.polarProductId],
      successUrl,
      customerEmail: buyer.email,
      metadata: {
        kind: COURSE_VIDEO_PRODUCT_KIND,
        courseVideoId: video.id,
        userId: buyer.id,
        productSlug: video.slug,
        productCategory: "education_advisory",
        exposureGuaranteed: "false",
      },
    });
    checkoutUrl = checkout.url;
  } catch (error) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error ? (error as { statusCode: unknown }).statusCode : undefined;
    console.error("Polar checkout creation failed for course video:", {
      courseVideoId: video.id,
      statusCode,
      error: error instanceof Error ? error.message : error,
    });
    throw new CourseError(502, "checkout_failed", "Unable to create checkout session. Please try again or contact support.");
  }

  if (!checkoutUrl) {
    console.error("Polar checkout created without a URL for course video:", video.id);
    throw new CourseError(502, "checkout_failed", "Unable to create checkout session. Please try again or contact support.");
  }
  return { url: checkoutUrl };
}
