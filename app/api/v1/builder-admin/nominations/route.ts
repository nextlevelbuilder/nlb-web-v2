import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { recordModerationAction } from "@/lib/builder-league/audit";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { evaluateRank, recordNomination } from "@/lib/builder-league/ranks";
import { RANK_KEYS } from "@/lib/builder-league/types";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    nomineeUserId: z.string().min(1).max(128),
    rank: z.enum(RANK_KEYS).default("legend"),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

// POST /api/v1/builder-admin/nominations - the signed-in admin (a mentor) nominates a member for a rank.
// One nomination per mentor, member, rank and calendar year; the rank gate is re-evaluated afterwards.
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-admin-nominations");
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    if (body.nomineeUserId === caller.user.id) {
      throw new BuilderApiError(400, "self_nomination", "Mentors cannot nominate themselves.");
    }
    const [nominee] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.nomineeUserId)).limit(1);
    if (!nominee) throw new BuilderApiError(404, "nominee_not_found", "Member not found.");

    const { created, year } = await recordNomination(db, {
      nomineeUserId: body.nomineeUserId,
      mentorUserId: caller.user.id,
      rank: body.rank,
      note: body.note ?? null,
    });
    if (created) {
      await recordModerationAction(db, {
        targetType: "rank",
        targetId: body.nomineeUserId,
        action: "nominate",
        actorId: caller.user.id,
        actorRole: "admin",
        reasonCodes: [`nomination_${body.rank}`],
        notes: body.note ?? null,
      });
    }
    const evaluation = await evaluateRank(db, body.nomineeUserId, { actorId: caller.user.id });
    return ok(
      { created, year, rank: body.rank, currentRank: evaluation.currentRank, awarded: evaluation.awarded },
      undefined,
      created ? 201 : 200
    );
  });
}
