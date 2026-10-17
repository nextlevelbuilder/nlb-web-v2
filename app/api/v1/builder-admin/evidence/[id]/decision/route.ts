import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { ok } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { toEvidenceDto } from "@/lib/builder-league/evidence";
import { decideEvidence, toAwardDto } from "@/lib/builder-league/moderation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Approve, reject or request information on evidence. Admin session only (API keys and agents are
 * refused by `requireBuilderLeagueAdmin`); never on one's own evidence. Approval is idempotent: a double
 * click or concurrent approval awards once and both callers see the same ledger entry.
 */
export async function POST(request: Request, { params }: Params) {
  return handleWrite(
    request,
    "/studio/builder-league/moderation",
    () => requireBuilderLeagueAdmin(request, getDb()),
    async (input, { caller, actorRole }) => {
      const { id } = await params;
      const outcome = await decideEvidence(getDb(), id, input.body, { actorId: caller.user.id, actorRole });
      return {
        response: ok({
          decision: outcome.decision,
          decided: outcome.decided,
          evidence: toEvidenceDto(outcome.evidence, "admin"),
          award: outcome.decision === "approve" ? toAwardDto(outcome.award) : null,
        }),
        notice: outcome.decision === "approve" ? "approved" : outcome.decision === "reject" ? "rejected" : "info_requested",
      };
    }
  );
}
