import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { polar } from "@/lib/polar";
import { createCourseVideoCheckout } from "@/lib/courses/course-checkout";
import { courseNotFound } from "@/lib/courses/course-errors";
import { courseCheckoutSchema } from "@/lib/courses/course-video-schemas";
import { getPublishedVideoBySlug } from "@/lib/courses/course-video-service";
import { readJsonBody, readSlug, requireCaller, toErrorResponse, type RouteContext } from "@/lib/courses/course-route-helpers";

export const dynamic = "force-dynamic";

/** Signed-in buyers only: the checkout is bound to the account email so the order maps back to them. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const caller = await requireCaller(request);
    const slug = await readSlug(context);
    const { locale } = courseCheckoutSchema.parse(await readJsonBody(request));
    const video = await getPublishedVideoBySlug(slug, getDb());
    if (!video) throw courseNotFound();
    const checkout = await createCourseVideoCheckout(video, { id: caller.user.id, email: caller.user.email }, polar, locale);
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    return toErrorResponse(error, "Course video checkout");
  }
}
