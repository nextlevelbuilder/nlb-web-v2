// Offer data for the website chat agent (plans, prices, seats, courses, FAQ, links), read through the
// widget's `site.catalog` page action. Public, read-only and not part of /api/v1.
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildChatCatalog } from "@/lib/chat/chat-catalog";
import { getCourseRuntimeEnv } from "@/lib/courses/course-runtime-env";
import { membershipProductIds } from "@/lib/home/membership-product-ids";
import { getMembershipSeatAvailability } from "@/lib/home/membership-seats";
import { defaultLocale, isLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("locale");
  const locale = isLocale(requested) ? requested : defaultLocale;
  const db = getDb();
  // Seats are optional: without counts the catalog says nothing about scarcity rather than guess.
  const seats = await getMembershipSeatAvailability(membershipProductIds(), db).catch((error) => {
    console.error("chat catalog: seat availability unavailable", error instanceof Error ? error.message : error);
    return null;
  });
  try {
    const catalog = await buildChatCatalog({ locale, db, seats, courseAccessPlans: getCourseRuntimeEnv().COURSES_ACCESS_PLANS });
    return NextResponse.json(catalog, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("chat catalog failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 503 });
  }
}
