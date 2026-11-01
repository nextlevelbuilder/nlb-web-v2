import { ok } from "@/lib/builder-league/http";
import { toEvidenceDto } from "@/lib/builder-league/evidence";
import { DecisionInputSchema, decideEvidence, toAwardDto } from "@/lib/builder-league/moderation";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

/**
 * Approve, reject or request information on evidence. Session only: a named human decides, as on the
 * Builder League admin pages; never on one's own evidence. Approval is idempotent.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.evidence.decide",
    sessionOnly: true,
    prepare: async () => {
      const evidenceId = requirePathParam((await params).id, "id");
      const input = DecisionInputSchema.parse((await readJsonObject(request)).body);
      return { resource: `builder_league:evidence:${evidenceId}`, args: { evidenceId, decision: input.decision }, evidenceId, input };
    },
    run: async ({ db, subject }, { evidenceId, input }) => {
      const outcome = await decideEvidence(db, evidenceId, input, { actorId: subject.userId, actorRole: "admin" });
      return ok({
        decision: outcome.decision,
        decided: outcome.decided,
        evidence: toEvidenceDto(outcome.evidence, "admin"),
        award: outcome.decision === "approve" ? toAwardDto(outcome.award) : null,
      });
    },
  });
}
