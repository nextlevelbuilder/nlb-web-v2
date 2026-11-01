import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { recordModerationDecision } from "@/lib/domain/moderation";
import { getModerationCase } from "@/lib/operators/http/operator-content-queries";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorConflict, operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    decision: z.enum(["approved", "changes_requested", "rejected", "quarantined"]),
    reasonCodes: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

/**
 * Record a named human moderation decision. Session only: policy forbids an agent from approving a
 * listing, so an MCP delegation is refused with `session_required`. Approval publishes the product.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  return runOperatorRoute({
    request,
    domain: "directory",
    action: "directory.moderation.decide",
    sessionOnly: true,
    prepare: async ({ db }) => {
      const modCase = await getModerationCase(db, requirePathParam((await params).caseId, "caseId"));
      if (!modCase) throw operatorNotFound("Moderation case");
      if (modCase.status === "decided") throw operatorConflict("case_decided", "The case already has a decision");
      const input = bodySchema.parse((await readJsonObject(request)).body);
      return {
        resource: `moderation_case:${modCase.id}`,
        args: { caseId: modCase.id, decision: input.decision, reasonCodes: input.reasonCodes },
        details: { decision: input.decision },
        caseId: modCase.id,
        input,
      };
    },
    run: async ({ db, subject }, { caseId, input }) =>
      ok(await recordModerationDecision({ caseId, ...input, humanReviewerId: subject.userId, reviewerRole: "operator:directory" }, db)),
  });
}
