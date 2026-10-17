import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getSessionUser, scheduleOnboardingJobRun, upgradeMembershipToVip } from "@/lib/onboarding/status";
import { polar } from "@/lib/polar";

export const dynamic = "force-dynamic";

/** Premium → VIP on the member's existing subscription; Polar invoices the difference now. */
export async function POST(request: Request) {
  if (!isOnboardingV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const result = await upgradeMembershipToVip(db, user.id, polar);
  if (!result.ok) {
    if (result.error === "rate_limited") {
      const retryAfter = Math.ceil(result.retryAfterMs / 1000);
      return NextResponse.json(
        { error: "rate_limited", retryAfter },
        { status: 429, headers: { "retry-after": String(retryAfter) } }
      );
    }
    // 409: no_membership (the client may start a VIP checkout), already_vip, past_due or
    // no_upgradeable_subscription (the client must not start a second subscription).
    const status = result.error === "upgrade_failed" ? 502 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  scheduleOnboardingJobRun(db);
  return NextResponse.json({ upgraded: true, membership: result.membership });
}
