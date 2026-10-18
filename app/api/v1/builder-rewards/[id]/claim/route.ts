import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody, serializeClaim } from "@/lib/builder-league/progression-api";
import { claimReward } from "@/lib/builder-league/rewards";

export const dynamic = "force-dynamic";

const claimBodySchema = z.object({ note: z.string().trim().max(500).nullable().optional() }).strict();

/** Requests a reward for the current period. Members only; API keys and agents may not claim. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller, actorRole } = await requireBuilderLeagueUser(request, "builder:write", db);
    if (actorRole === "api" || actorRole === "agent") {
      throw new BuilderApiError(403, "session_required", "Rewards are claimed by the member in a signed-in session.");
    }
    enforceUserRateLimit(caller.user.id, "builder-rewards-claim");
    const { id } = await params;
    const body = claimBodySchema.parse(await readJsonBody(request));
    const claim = await claimReward(db, caller.user.id, id, { note: body.note ?? null });
    return ok(serializeClaim(claim), undefined, 201);
  });
}
