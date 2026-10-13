import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { products, analyticsEvents, users, votes } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();

    const [
      productsResult,
      outboundResult,
      usersResult,
      votesResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.status, "published")),
      db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(eq(analyticsEvents.eventType, "outbound_click")),
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(votes),
    ]);

    const publishedCount = productsResult[0]?.count ?? 0;
    const outboundClicks = outboundResult[0]?.count ?? 0;
    const registeredBuilders = usersResult[0]?.count ?? 0;
    const totalVotes = votesResult[0]?.count ?? 0;

    return NextResponse.json(
      {
        success: true,
        stats: {
          publishedCount,
          outboundClicks,
          registeredBuilders,
          totalVotes,
        },
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch directory stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Directory stats temporarily unavailable",
        stats: null,
      },
      { status: 500 }
    );
  }
}
