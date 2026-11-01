import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { serializeClaim } from "@/lib/builder-league/progression-api";
import { CLAIM_ACTIONS, decideClaim } from "@/lib/builder-league/rewards";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    action: z.enum(CLAIM_ACTIONS),
    note: z.string().trim().max(500).nullable().optional(),
    redeemWithinDays: z.number().int().min(1).max(365).optional(),
  })
  .strict();

/** Approve, reject, redeem, expire or cancel a reward claim; a freed place returns to inventory. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.claim.decide",
    prepare: async () => {
      const claimId = requirePathParam((await params).id, "id");
      const body = bodySchema.parse((await readJsonObject(request)).body);
      return { resource: `builder_league:claim:${claimId}`, args: { claimId, action: body.action }, claimId, body };
    },
    run: async ({ db, subject }, { claimId, body }) => ok(serializeClaim(await decideClaim(db, { claimId, actorId: subject.userId, actorRole: "admin", ...body }))),
  });
}
