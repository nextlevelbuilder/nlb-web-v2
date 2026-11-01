/**
 * Privacy-preserving signals for the affiliate fraud heuristics. Nothing readable is stored: a device
 * is the first-party random visitor id (cookie `nlb_wv`, the same id the `/r` redirect uses) and a
 * payout instrument is the normalized PayPal email or bank account, each kept only as an HMAC under a
 * key derived (HKDF) from `ONBOARDING_ENCRYPTION_KEY`. Hashes are stable across days so the same
 * device or instrument can be matched across accounts; they cannot be reversed without the key.
 */
import { and, eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import type { AppDb } from "@/lib/db";
import { affiliateDevices } from "@/lib/db/schema";
import { isValidVisitorId, VISITOR_COOKIE } from "@/lib/builder-league/attribution";
import { getOnboardingEnv } from "@/lib/onboarding/flags";
import { optedOutOfTracking } from "./referral-env";

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function riskKey(rawKey: string): Promise<CryptoKey> {
  let cached = keyCache.get(rawKey);
  if (!cached) {
    cached = (async () => {
      const bytes = Uint8Array.from(atob(rawKey.trim().replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
      const base = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode("nlb-affiliate-risk-v1") },
        base,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        false,
        ["sign"]
      );
    })();
    keyCache.set(rawKey, cached);
  }
  return cached;
}

/** Keyed hash of `value` for one purpose; null when the key is not configured (the heuristic is then skipped). */
export async function riskHash(purpose: "device" | "instrument", value: string): Promise<string | null> {
  const rawKey = getOnboardingEnv().ONBOARDING_ENCRYPTION_KEY;
  if (!rawKey || !value) return null;
  const signature = await crypto.subtle.sign("HMAC", await riskKey(rawKey), encoder.encode(`${purpose}:${value}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The first-party visitor id of this browser, if it has a valid one. */
export function readVisitorId(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${VISITOR_COOKIE}=`));
  const value = match ? match.slice(VISITOR_COOKIE.length + 1) : null;
  return isValidVisitorId(value) ? value : null;
}

export async function deviceHashFor(visitorId: string | null | undefined): Promise<string | null> {
  return visitorId ? riskHash("device", visitorId) : null;
}

/** Normalized payout instrument: the PayPal email (case-folded) or the bank account digits with the bank name. */
export async function instrumentHashFor(type: "paypal" | "bank_vn", details: Record<string, string>): Promise<string | null> {
  const value =
    type === "paypal"
      ? (details.paypalEmail ?? "").trim().toLowerCase()
      : `${(details.bankName ?? "").trim().toLowerCase().replace(/\s+/g, " ")}|${(details.accountNumber ?? "").replace(/\D/g, "")}`;
  return riskHash("instrument", value);
}

/**
 * Remembers a device seen on the affiliate's own signed-in session (upsert of its last-seen time).
 * Best effort: a failure is logged and never fails the request.
 */
export async function recordAffiliateDevice(db: AppDb, affiliateId: string, visitorId: string | null, now = new Date()): Promise<void> {
  try {
    const deviceHash = await deviceHashFor(visitorId);
    if (!deviceHash) return;
    await db
      .insert(affiliateDevices)
      .values({ affiliateId, deviceHash, createdAt: now, lastSeenAt: now })
      .onConflictDoUpdate({ target: [affiliateDevices.affiliateId, affiliateDevices.deviceHash], set: { lastSeenAt: now } });
  } catch (error) {
    console.error("affiliate device signal was not recorded (non-fatal)", { error: error instanceof Error ? error.message : "unknown" });
  }
}

/** Whether `deviceHash` was seen on the affiliate's own sessions. */
export async function isAffiliateDevice(db: AppDb, affiliateId: string, deviceHash: string): Promise<boolean> {
  const [row] = await db
    .select({ id: affiliateDevices.id })
    .from(affiliateDevices)
    .where(and(eq(affiliateDevices.affiliateId, affiliateId), eq(affiliateDevices.deviceHash, deviceHash)))
    .limit(1);
  return Boolean(row);
}

const VISITOR_MAX_AGE_S = 365 * 24 * 60 * 60;

/**
 * Records the device of an affiliate's own signed-in session. A browser without a visitor id gets one
 * (first-party, httpOnly) unless it sends GPC or DNT; an existing id is always used, because it is the
 * same id a later referred checkout from this browser would carry.
 */
export async function trackAffiliateSessionDevice(db: AppDb, affiliateId: string, request: Request, response: NextResponse, now = new Date()): Promise<NextResponse> {
  let visitorId = readVisitorId(request);
  if (!visitorId && !optedOutOfTracking(request)) {
    visitorId = crypto.randomUUID();
    const secure = new URL(request.url).protocol === "https:";
    response.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: VISITOR_MAX_AGE_S });
  }
  await recordAffiliateDevice(db, affiliateId, visitorId, now);
  return response;
}
