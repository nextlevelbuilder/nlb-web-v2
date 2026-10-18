import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { revokeBadge } from "@/lib/builder-league/badges";
import { enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody } from "@/lib/builder-league/progression-api";

export const dynamic = "force-dynamic";

const revokeSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

/** Revokes a badge award with a reason; audited and recorded on the member's journey. */
export async function POST(request: Request, { params }: { params: Promise<{ awardId: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-admin-rewards");
    const { awardId } = await params;
    const { reason } = revokeSchema.parse(await readJsonBody(request));
    const award = await revokeBadge(db, { awardId, actorId: caller.user.id, actorRole: "admin", reason });
    return ok({
      id: award.id,
      userId: award.userId,
      badgeKey: award.badgeKey,
      seasonKey: award.seasonKey || null,
      revokedAt: award.revokedAt ? award.revokedAt.toISOString() : null,
      revokeReason: award.revokeReason,
    });
  });
}
