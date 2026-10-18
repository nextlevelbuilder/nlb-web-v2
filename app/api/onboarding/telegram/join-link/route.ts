import { getDb } from "@/lib/db";
import { createTelegramJoinLinkResponse, requireEntitledMember } from "@/lib/community/telegram-onboarding";

/** Per-user invite link (24 hours) that files a join request; the webhook approves it. */
export async function POST(request: Request) {
  const db = getDb();
  const member = await requireEntitledMember(request, db);
  if (member instanceof Response) return member;
  return createTelegramJoinLinkResponse(db, member.userId);
}
