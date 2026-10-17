import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordAnalyticsEvent } from "@/lib/domain/analytics";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const db = getDb();

  try {
    const [product] = await db
      .select({
        id: products.id,
        websiteUrl: products.websiteUrl,
        status: products.status,
      })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (!product || product.status !== "published") {
      return NextResponse.redirect(new URL("/directory", request.url));
    }

    // Record asynchronous outbound click event (fail-open)
    try {
      const referrer = request.headers.get("referer") || undefined;
      const country = request.headers.get("cf-ipcountry") || undefined;
      await recordAnalyticsEvent({
        eventType: "outbound_click",
        productId: product.id,
        referrerHost: referrer,
        countryCode: country,
      });
    } catch (analyticsError) {
      console.error("Failed to record outbound click (non-fatal):", analyticsError);
    }

    return NextResponse.redirect(product.websiteUrl, { status: 307 });
  } catch (error) {
    console.error("Error in /go redirect:", error);
    return NextResponse.redirect(new URL("/directory", request.url));
  }
}
