import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { locales } from "@/i18n/routing";
import { getPublishedVideoBySlug } from "@/lib/courses/course-video-service";
import { isSepayEnabled, resolveCourseVideo, resolveStaticSku, sepayOrderView, type SepayProduct } from "@/lib/payments/sepay-catalog";
import { createSepayOrder } from "@/lib/payments/sepay-orders";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    sku: z.enum(["premium_quarterly", "premium_annual", "vip_quarterly", "vip_annual", "publishing_toolkit"]).optional(),
    courseVideoSlug: z.string().trim().min(1).max(200).optional(),
    locale: z.enum(locales).optional(),
  })
  .refine((body) => Boolean(body.sku) !== Boolean(body.courseVideoSlug), { message: "Pass exactly one of sku or courseVideoSlug" });

/**
 * Start a VietQR bank-transfer checkout. Signed-in buyers only: the order is bound to the account,
 * and the price is resolved server-side. Returns the transfer instructions and the QR image URL.
 */
export async function POST(request: Request) {
  if (!isSepayEnabled()) return NextResponse.json({ error: "SePay checkout is not available", code: "sepay_disabled" }, { status: 404 });
  const caller = await resolveCaller(request.headers);
  if (!caller?.user.email) return NextResponse.json({ error: "Sign in to continue", code: "unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request data", code: "validation_failed" }, { status: 400 });
  }

  const db = getDb();
  let product: SepayProduct | null = null;
  if (parsed.sku) {
    product = resolveStaticSku(parsed.sku);
  } else if (parsed.courseVideoSlug) {
    const video = await getPublishedVideoBySlug(parsed.courseVideoSlug, db);
    product = video ? resolveCourseVideo(video) : null;
  }
  if (!product) return NextResponse.json({ error: "Product is not sold via bank transfer", code: "product_unavailable" }, { status: 404 });

  const order = await createSepayOrder(db, {
    userId: caller.user.id,
    email: caller.user.email,
    product,
    locale: parsed.locale ?? null,
  });
  return NextResponse.json(
    sepayOrderView(order),
    { status: 201 }
  );
}
