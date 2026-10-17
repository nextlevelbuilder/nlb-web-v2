import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { members, products } from "@/lib/db/schema";
import { queryTraffic, trafficRange } from "@/lib/traffic/traffic";

export async function GET(request: Request, {params}: {params: Promise<{slug: string}>}) {
  const caller = await resolveCaller(request.headers, undefined, {
    scope: "mcp:read", method: request.method, path: new URL(request.url).pathname,
  });
  if (!caller?.user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  try {
    const range = trafficRange(new URL(request.url).searchParams);
    const {slug} = await params;
    const db = getDb();
    const [product] = await db.select({id: products.id, orgId: products.orgId}).from(products).where(eq(products.slug, slug)).limit(1);
    if (!product) return NextResponse.json({error: "Product not found"}, {status: 404});
    if (caller.authType === "api_key" && caller.apiKeyOrganizationId && caller.apiKeyOrganizationId !== product.orgId) {
      return NextResponse.json({error: "Forbidden: API key belongs to another organization"}, {status: 403});
    }
    const [membership] = await db.select({id: members.id}).from(members)
      .where(and(eq(members.organizationId, product.orgId), eq(members.userId, caller.user.id))).limit(1);
    if (!membership && caller.user.role !== "admin") return NextResponse.json({error: "Forbidden"}, {status: 403});
    return NextResponse.json({data: await queryTraffic(product.id, range)}, {headers: {"Cache-Control": "private, no-store"}});
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof RangeError) return NextResponse.json({error: "Invalid date range; use ISO timestamps spanning at most 90 days"}, {status: 400});
    return NextResponse.json({error: "Traffic analytics unavailable"}, {status: 503});
  }
}
