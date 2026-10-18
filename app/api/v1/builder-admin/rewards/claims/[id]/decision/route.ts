import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody, serializeClaim } from "@/lib/builder-league/progression-api";
import { CLAIM_ACTIONS, decideClaim } from "@/lib/builder-league/rewards";

export const dynamic = "force-dynamic";

const decisionSchema = z
  .object({
    action: z.enum(CLAIM_ACTIONS),
    note: z.string().trim().max(500).nullable().optional(),
    redeemWithinDays: z.number().int().min(1).max(365).optional(),
  })
  .strict();

/** Approve, reject, redeem, expire or cancel a claim; audited, and a freed place returns to inventory. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-admin-rewards");
    const { id } = await params;
    const body = decisionSchema.parse(await readJsonBody(request));
    const claim = await decideClaim(db, { claimId: id, actorId: caller.user.id, actorRole: "admin", ...body });
    return ok(serializeClaim(claim));
  });
}
