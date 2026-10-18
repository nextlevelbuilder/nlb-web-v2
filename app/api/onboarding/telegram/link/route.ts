import { getDb } from "@/lib/db";
import { createTelegramLinkResponse, requireEntitledMember } from "@/lib/community/telegram-onboarding";

/** Issue a one-time `t.me` deep link (10 minutes) that links the opener's Telegram account. */
export async function POST(request: Request) {
  const db = getDb();
  const member = await requireEntitledMember(request, db);
  if (member instanceof Response) return member;
  return createTelegramLinkResponse(db, member.userId);
}
