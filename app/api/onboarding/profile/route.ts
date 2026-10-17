import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getMemberTier } from "@/lib/membership/member-access";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getSessionUser, onboardingProfileSchema, saveOnboardingProfile } from "@/lib/onboarding/status";

export const dynamic = "force-dynamic";

/** Save the member form (progress or final submit). Requires a session and an effective membership. */
export async function POST(request: Request) {
  if (!isOnboardingV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const { tier } = await getMemberTier(db, user.id);
  if (tier === "none") return NextResponse.json({ error: "membership_required" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = onboardingProfileSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "body")))];
    return NextResponse.json({ error: "invalid_profile", fields }, { status: 400 });
  }

  const profile = await saveOnboardingProfile(db, user.id, parsed.data);
  return NextResponse.json({ profile });
}
