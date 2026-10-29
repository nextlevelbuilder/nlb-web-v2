import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { AnalyticsBlockSchema } from "@nextlevelbuilder/contracts";
import { publicTrafficRange, queryTraffic, publicTraffic } from "@/lib/traffic/traffic";

export async function GET(request: Request, {params}: {params: Promise<{slug: string}>}) {
  try {
    const range = publicTrafficRange(new URL(request.url).searchParams.get("period") || "30d");
    const {slug} = await params;
    const result = await getPublishedProductBySlug(slug);
    if (!result || !["approved", "published"].includes(result.revision.status)) return NextResponse.json({error: "Public analytics not enabled"}, {status: 404});
    const raw: unknown = typeof result.revision.document === "string" ? JSON.parse(result.revision.document) : result.revision.document;
    const document = z.object({blocks: z.array(z.unknown())}).safeParse(raw);
    if (!document.success || !document.data.blocks.some((block) => AnalyticsBlockSchema.safeParse(block).success)) {
      return NextResponse.json({error: "Public analytics not enabled"}, {status: 404});
    }
    // Check opt-in on each request so removing/unpublishing a block revokes access.
    return NextResponse.json({data: publicTraffic(await queryTraffic(result.product.id, range, false))}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error: "Invalid period"}, {status: 400});
    return NextResponse.json({error: "Traffic analytics unavailable"}, {status: 503});
  }
}
