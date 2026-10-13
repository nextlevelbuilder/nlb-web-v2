import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { products } from "@/lib/db/schema";

export async function GET() {
  try {
    const db = getDb();
    const [row] = await db.all<{ version: string }>(sql`SELECT sqlite_version() AS version`);
    const prods = await db.select().from(products).limit(5);
    
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        db_engine: `d1/sqlite ${row?.version ?? "unknown"}`,
        products_count: prods.length,
        sample_product: prods[0] ? { title: prods[0].title, slug: prods[0].slug } : null,
        timestamp: new Date().toISOString(),
        service: "nextlevelbuilder-web"
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database connection check failed";
    return NextResponse.json(
      {
        status: "degraded",
        database: "disconnected",
        error: message,
        timestamp: new Date().toISOString(),
        service: "nextlevelbuilder-web"
      },
      { status: 200 }
    );
  }
}
