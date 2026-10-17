import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { toEvidenceDto } from "@/lib/builder-league/evidence";
import { toAwardDto } from "@/lib/builder-league/moderation";
import { confirmPeerHelp } from "@/lib/builder-league/peer-help";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * The named counterparty confirms peer help. Signed-in members only: API keys and agents are refused,
 * because a confirmation is a verification.
 */
export async function POST(request: Request, { params }: Params) {
  return handleWrite(
    request,
    "/builder-league/evidence",
    () => requireBuilderLeagueUser(request, "builder:write", getDb()),
    async (_input, { caller, actorRole }) => {
      const { id } = await params;
      enforceUserRateLimit(caller.user.id, "builder-confirm");
      const outcome = await confirmPeerHelp(getDb(), id, { userId: caller.user.id, actorRole });
      return {
        response: ok({
          evidence: toEvidenceDto(outcome.evidence, "counterparty"),
          confirmed: outcome.confirmed,
          requiresModerator: outcome.requiresModerator,
          award: outcome.approval ? toAwardDto(outcome.approval.award) : null,
        }),
        notice: "confirmed",
      };
    }
  );
}
