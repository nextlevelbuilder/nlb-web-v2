import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { CommunityProvider } from "@/lib/community/types";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getSessionUser, scheduleOnboardingJobRun, unlinkCommunityConnection } from "@/lib/onboarding/status";

export const dynamic = "force-dynamic";

const PROVIDERS: readonly CommunityProvider[] = ["discord", "telegram"];

/** Unlink a Discord or Telegram account: access is revoked first, then the link is removed. */
export async function DELETE(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!isOnboardingV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { provider } = await params;
  if (!PROVIDERS.includes(provider as CommunityProvider)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }

  const db = getDb();
  const result = await unlinkCommunityConnection(db, user.id, provider as CommunityProvider);
  if (result === "not_linked") return NextResponse.json({ error: "not_linked" }, { status: 404 });
  if (result === "revoke_failed") return NextResponse.json({ error: "revoke_failed" }, { status: 502 });
  scheduleOnboardingJobRun(db);
  return NextResponse.json({ unlinked: true });
}
