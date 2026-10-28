import { ok } from "@/lib/builder-league/http";
import { hashOperatorArgs, recordOperatorAudit } from "@/lib/operators/operator-audit";
import { requestApproval } from "@/lib/operators/operator-approvals";
import { OperatorAccessError } from "@/lib/operators/operator-errors";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { approvalRequestSchema } from "@/lib/live/http/live-operator-schemas";
import { resolveSensitiveTarget } from "@/lib/live/http/live-sensitive-targets";

export const dynamic = "force-dynamic";

/**
 * Request a two-person approval for a sensitive Live action. The approval is bound to the action's
 * canonical resource and argument hash (see lib/live/http/live-sensitive-targets.ts), must be approved
 * by a different operator, expires after `ttlMinutes` (default 30) and can be used once, by the
 * requester, on the matching action route.
 */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    // The guard row; `requestApproval` adds its own `operator.approval.request` row with the approval id.
    action: "live.approval.request",
    prepare: async ({ db }) => {
      const input = approvalRequestSchema.parse((await readJsonObject(request)).body);
      const target = await resolveSensitiveTarget(db, input.action, input.target);
      return { resource: target.resource, args: { action: input.action, ...target.args }, details: { requestedAction: input.action }, input, target };
    },
    run: async ({ db, subject, now }, { input, target }) => {
      const argsHash = hashOperatorArgs(target.args);
      try {
        const approval = await requestApproval(db, {
          subject,
          action: input.action,
          resource: target.resource,
          argsHash,
          reason: input.reason,
          ttlMs: input.ttlMinutes ? input.ttlMinutes * 60_000 : undefined,
          now,
        });
        return ok({ id: approval.id, status: "pending", action: input.action, resource: target.resource, argsHash, expiresAt: approval.expiresAt }, undefined, 201);
      } catch (error) {
        if (error instanceof OperatorAccessError) {
          await recordOperatorAudit(db, {
            actorUserId: subject.userId, actorAuthType: subject.authType, clientId: subject.clientId,
            action: "operator.approval.request", resource: target.resource, decision: "deny", reason: error.code, argsHash, now,
          }).catch((auditError) => console.error("operator audit failed", auditError instanceof Error ? auditError.message : auditError));
        }
        throw error;
      }
    },
  });
}
