/**
 * Handlers behind `/api/v1/operator/approvals[/{id}[/decision]]?domain=<domain>`. The domain decides
 * which `<domain>:manage` capability the caller needs and limits every read to that domain's sensitive
 * actions, so an operator never sees or decides approvals of a domain they do not manage.
 */
import { z } from "zod";
import { ok, parseCursor, parseLimit } from "@/lib/builder-league/http";
import type { OperatorApprovalStatus, OperatorDomain, SensitiveOperatorAction } from "@/lib/access/types";
import { APPROVAL_STATUSES, getApprovalView, listApprovalPage } from "@/lib/operators/operator-approval-reads";
import { decideApproval, requestApproval } from "@/lib/operators/operator-approvals";
import { hashOperatorArgs, recordOperatorAudit } from "@/lib/operators/operator-audit";
import { approvalError, OperatorAccessError } from "@/lib/operators/operator-errors";
import { operatorInvalid, operatorNotFound } from "@/lib/operators/operator-service-error";
import { withOperatorErrors } from "./operator-http-errors";
import { operatorDomainResource, readJsonObject, requirePathParam, runOperatorRoute } from "./operator-route";
import { approvalActionsFor, OPERATOR_APPROVAL_ACTIONS, parseApprovalDomain, resolveOperatorTarget } from "./operator-sensitive-targets";

const approvalRequestSchema = z
  .object({
    action: z.string().refine((value) => (OPERATOR_APPROVAL_ACTIONS as string[]).includes(value), "unknown sensitive action"),
    /** Arguments of the action, see lib/operators/http/operator-sensitive-targets.ts. */
    target: z.record(z.unknown()),
    reason: z.string().trim().min(1).max(500),
    ttlMinutes: z.number().int().min(1).max(24 * 60).optional(),
  })
  .strict();

const approvalDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]) }).strict();

/** Runs `handler` for a valid `?domain=`; domains without generic sensitive actions have no approvals. */
function withDomain(request: Request, handler: (domain: OperatorDomain, actions: SensitiveOperatorAction[]) => Promise<Response>): Promise<Response> {
  return withOperatorErrors(async () => {
    const domain = parseApprovalDomain(new URL(request.url).searchParams.get("domain"));
    return handler(domain, approvalActionsFor(domain));
  });
}

/** Approvals of the domain, newest first; `?status=` (default `pending`), `?cursor=`, `?limit=` max 100. */
export function listApprovals(request: Request): Promise<Response> {
  return withDomain(request, (domain, actions) =>
    runOperatorRoute({
      request,
      domain,
      action: `${domain}.approval.list`,
      prepare: async () => {
        const query = new URL(request.url).searchParams;
        const raw = query.get("status")?.trim() || "pending";
        if (!(APPROVAL_STATUSES as readonly string[]).includes(raw)) throw operatorInvalid(`status must be one of ${APPROVAL_STATUSES.join(", ")}`);
        const status = raw as OperatorApprovalStatus;
        const limit = parseLimit(query.get("limit"), 50, 100);
        return { resource: operatorDomainResource(domain), args: { status, limit }, filter: { status, limit, cursor: parseCursor(query.get("cursor")) } };
      },
      run: async ({ db, now }, { filter }) => {
        if (actions.length === 0) return ok([], { nextCursor: null, limit: filter.limit });
        const page = await listApprovalPage(db, { ...filter, actions, now });
        return ok(page.items, page.pagination);
      },
    })
  );
}

/**
 * Request a two-person approval for a sensitive action of the domain. Bound to the action's canonical
 * resource and argument hash, decided by a different operator, valid for `ttlMinutes` (default 30) and
 * usable once, by the requester, on the matching action route.
 */
export function createApproval(request: Request): Promise<Response> {
  return withDomain(request, (domain) =>
    runOperatorRoute({
      request,
      domain,
      // The guard row; `requestApproval` adds its own `operator.approval.request` row with the approval id.
      action: `${domain}.approval.request`,
      prepare: async ({ db }) => {
        const input = approvalRequestSchema.parse((await readJsonObject(request)).body);
        const action = input.action as SensitiveOperatorAction;
        if (!approvalActionsFor(domain).includes(action)) throw approvalError("approval_domain_mismatch", `${action} is not a ${domain} action`);
        const target = await resolveOperatorTarget(db, action, input.target);
        return { resource: target.resource, args: { action, ...target.args }, details: { requestedAction: action }, input, action, target };
      },
      run: async ({ db, subject, now }, { input, action, target }) => {
        const argsHash = hashOperatorArgs(target.args);
        try {
          const approval = await requestApproval(db, {
            subject,
            action,
            resource: target.resource,
            args: target.args,
            reason: input.reason,
            ttlMs: input.ttlMinutes ? input.ttlMinutes * 60_000 : undefined,
            now,
          });
          return ok({ id: approval.id, status: "pending", action, resource: target.resource, argsHash, expiresAt: approval.expiresAt }, undefined, 201);
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
    })
  );
}

/** One approval of the domain with the canonical arguments behind its hash; other domains read as 404. */
export function readApproval(request: Request, params: Promise<{ id: string }>): Promise<Response> {
  return withDomain(request, (domain, actions) =>
    runOperatorRoute({
      request,
      domain,
      action: `${domain}.approval.read`,
      prepare: async () => {
        const approvalId = requirePathParam((await params).id, "id");
        return { resource: `approval:${approvalId}`, args: { approvalId }, approvalId };
      },
      run: async ({ db, now }, { approvalId }) => {
        const view = actions.length ? await getApprovalView(db, approvalId, now, actions) : null;
        if (!view) throw operatorNotFound("Approval");
        return ok(view);
      },
    })
  );
}

/**
 * Approve or reject a pending approval of the domain. The decider must be a different operator holding
 * the action's capability; expired, already decided and self decisions are refused (409) and audited.
 */
export function decideOperatorApproval(request: Request, params: Promise<{ id: string }>): Promise<Response> {
  return withDomain(request, (domain, actions) =>
    runOperatorRoute({
      request,
      domain,
      // The guard row; `decideApproval` adds its own `operator.approval.approve|reject` row.
      action: `${domain}.approval.decide`,
      prepare: async () => {
        const approvalId = requirePathParam((await params).id, "id");
        const { decision } = approvalDecisionSchema.parse((await readJsonObject(request)).body);
        return { resource: `approval:${approvalId}`, args: { approvalId, decision }, approvalId, decision };
      },
      run: async ({ db, subject, now }, { approvalId, decision }) => {
        if (!actions.length || !(await getApprovalView(db, approvalId, now, actions))) throw operatorNotFound("Approval");
        const result = await decideApproval(db, { approvalId, subject, decision, now });
        return ok({ id: approvalId, status: result.status });
      },
    })
  );
}
