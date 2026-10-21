import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { TrafficEventSchema } from "@nextlevelbuilder/contracts";
import { allowTrafficRequest, readTrafficBody } from "@/lib/traffic/collection";
import { recordTraffic } from "@/lib/traffic/traffic";

export async function POST(request: Request) {
  let body;
  try { body = TrafficEventSchema.parse(await readTrafficBody(request)); }
  catch { return NextResponse.json({error: "Invalid traffic event"}, {status: 400}); }
  if (!allowTrafficRequest(request, `traffic:${body.visitorId}:${body.productSlug || "directory"}:${body.event}`)) {
    return new NextResponse(null, {status: 204});
  }
  try {
    let productId = "";
    if (body.productSlug) {
      const [product] = await getDb().select({id: products.id}).from(products)
        .where(and(eq(products.slug, body.productSlug), eq(products.status, "published"))).limit(1);
      if (!product) return NextResponse.json({error: "Product not found"}, {status: 404});
      productId = product.id;
    }
    await recordTraffic({productId, visitorId: body.visitorId, event: body.event, referrer: body.referrer}, request);
    return new NextResponse(null, {status: 202});
  } catch { return NextResponse.json({error: "Traffic collection unavailable"}, {status: 503}); }
}
