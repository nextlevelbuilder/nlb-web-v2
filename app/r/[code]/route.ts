/**
 * Affiliate link redirect: `/r/<code>` → the link's allowlisted landing page with `?ref=<code>` and the
 * link's UTM tags. The visible `ref` lets the buyer carry the code to checkout explicitly. Browsers
 * that send DNT or GPC get neither the click count nor the 30-day attribution cookie; their
 * explicit `ref` still works. Unknown or inactive codes land on the home page without a referral.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { hashVisitor, isValidVisitorId, VISITOR_COOKIE } from "@/lib/builder-league/attribution";
import { findActiveLinkByCode, recordLinkClick } from "@/lib/referrals/affiliate-links";
import { AFFILIATE_COOKIE, formatAffiliateCookie } from "@/lib/referrals/affiliate-checkout";
import { getActiveRules } from "@/lib/referrals/program-rules";
import { isAffiliatesEnabled, optedOutOfTracking } from "@/lib/referrals/referral-env";

interface RouteParams {
  params: Promise<{ code: string }>;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}


export async function GET(request: Request, { params }: RouteParams) {
  const origin = env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  if (!isAffiliatesEnabled()) return new NextResponse("Not found", { status: 404 });
  const { code } = await params;
  const db = getDb();
  const link = await findActiveLinkByCode(db, code);
  if (!link) return NextResponse.redirect(new URL("/", origin), { status: 307 });

  const now = new Date();
  const destination = new URL(link.destinationPath, origin);
  destination.searchParams.set("ref", link.code);
  destination.searchParams.set("utm_source", "affiliate");
  destination.searchParams.set("utm_medium", "referral");
  if (link.utmCampaign) destination.searchParams.set("utm_campaign", link.utmCampaign);
  const response = NextResponse.redirect(destination, { status: 307 });
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (optedOutOfTracking(request)) return response;

  const { rules } = await getActiveRules(db);
  const maxAge = rules.attributionWindowDays * 24 * 60 * 60;
  const secure = origin.startsWith("https://");
  // Random first-party visitor id, stored only as a day- and link-salted HMAC (same scheme as share links).
  const existing = readCookie(request, VISITOR_COOKIE);
  const visitorId = isValidVisitorId(existing) ? existing : crypto.randomUUID();
  if (visitorId !== existing) response.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  try {
    const hash = hashVisitor(visitorId, link.id, now);
    if (hash) await recordLinkClick(db, link.id, hash, now);
  } catch (error) {
    console.error("affiliate click count failed (non-fatal)", error instanceof Error ? error.message : "unknown");
  }
  response.cookies.set(AFFILIATE_COOKIE, formatAffiliateCookie(link.code, now), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}
