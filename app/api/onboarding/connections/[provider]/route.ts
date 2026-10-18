import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { CommunityProvider } from "@/lib/community/types";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getSessionUser, scheduleOnboardingJobRun, unlinkCommunityConnection } from "@/lib/onboarding/status";

export const dynamic = "force-dynamic";

const PROVIDERS: readonly CommunityProvider[] = ["discord", "telegram"];

/**
 * Unlink a Discord or Telegram account. Answers 202 `{ unlinking: true }`: the access job revokes
 * access first and removes the link afterwards; the status endpoint reports progress.
 */
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
  scheduleOnboardingJobRun(db);
  return NextResponse.json({ unlinking: true }, { status: 202 });
}
