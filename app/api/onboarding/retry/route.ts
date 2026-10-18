import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { COMMUNITY_TARGETS } from "@/lib/community/types";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getSessionUser, requestMemberReconcile, scheduleOnboardingJobRun } from "@/lib/onboarding/status";

export const dynamic = "force-dynamic";

const retrySchema = z.object({ target: z.enum(COMMUNITY_TARGETS as [string, ...string[]]) });

/** Re-run access reconciliation for one community target; one request per 30 seconds per member. */
export async function POST(request: Request) {
  if (!isOnboardingV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_target" }, { status: 400 });

  const db = getDb();
  const result = await requestMemberReconcile(db, user.id, parsed.data.target as (typeof COMMUNITY_TARGETS)[number]);
  if (!result.ok) {
    const retryAfter = Math.ceil(result.retryAfterMs / 1000);
    return NextResponse.json(
      { error: "rate_limited", retryAfter },
      { status: 429, headers: { "retry-after": String(retryAfter) } }
    );
  }
  scheduleOnboardingJobRun(db);
  return NextResponse.json({ queued: true }, { status: 202 });
}
