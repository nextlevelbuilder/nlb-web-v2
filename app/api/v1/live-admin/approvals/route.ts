import { ok, parseCursor, parseLimit } from "@/lib/builder-league/http";
import type { OperatorApprovalStatus } from "@/lib/access/types";
import { APPROVAL_STATUSES, listApprovalPage } from "@/lib/operators/operator-approval-reads";
import { hashOperatorArgs, recordOperatorAudit } from "@/lib/operators/operator-audit";
import { requestApproval } from "@/lib/operators/operator-approvals";
import { OperatorAccessError } from "@/lib/operators/operator-errors";
import { LIVE_APPROVAL_ACTIONS, LIVE_OPERATOR_RESOURCE, runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { liveInvalid } from "@/lib/live/live-errors";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { approvalRequestSchema } from "@/lib/live/http/live-operator-schemas";
import { resolveSensitiveTarget } from "@/lib/live/http/live-sensitive-targets";

export const dynamic = "force-dynamic";

/**
 * Approvals for the deciding operator, newest first: action, resource, the canonical arguments behind
 * the hash, reason, requester and the effective status. `?status=` defaults to `pending` (not expired);
 * `?cursor=`, `?limit=` max 100.
 */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.approval.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const raw = query.get("status")?.trim() || "pending";
      if (!(APPROVAL_STATUSES as readonly string[]).includes(raw)) throw liveInvalid(`status must be one of ${APPROVAL_STATUSES.join(", ")}`);
      const status = raw as OperatorApprovalStatus;
      const cursor = parseCursor(query.get("cursor"));
      const limit = parseLimit(query.get("limit"), 50, 100);
      return { resource: LIVE_OPERATOR_RESOURCE, args: { status, limit }, filter: { status, cursor, limit } };
    },
    run: async ({ db, now }, { filter }) => {
      const page = await listApprovalPage(db, { ...filter, actions: LIVE_APPROVAL_ACTIONS, now });
      return ok(page.items, page.pagination);
    },
  });
}

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
          args: target.args,
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
