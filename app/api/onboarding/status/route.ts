import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getOnboardingStatus, getSessionUser, scheduleOnboardingJobRun } from "@/lib/onboarding/status";
import { polar } from "@/lib/polar";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/** Onboarding state of the signed-in member; `checkout_id` only selects which Polar checkout to verify. */
export async function GET(request: Request) {
  if (!isOnboardingV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const raw = new URL(request.url).searchParams.get("checkout_id");
  const checkoutId = raw && /^[A-Za-z0-9_-]{1,100}$/.test(raw) ? raw : null;
  const db = getDb();
  const status = await getOnboardingStatus(db, user, { checkoutId, polar });
  scheduleOnboardingJobRun(db);
  return NextResponse.json(status, { headers: NO_STORE });
}
