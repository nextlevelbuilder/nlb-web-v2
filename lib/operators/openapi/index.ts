/**
 * OpenAPI paths for the platform operator API (`/api/v1/operator`), merged additively into lib/openapi.ts.
 * Every call needs a live `<domain>:manage` grant (a session, or an MCP delegation carrying
 * `mcp:operator`; API keys are refused) and writes an audit row, allowed or denied. Sensitive actions
 * need an `approvalId` from `POST /api/v1/operator/approvals?domain=<domain>`, decided by a different operator.
 */
import { OPERATOR_DOMAINS } from "@/lib/access/types";
import { OPERATOR_APPROVAL_ACTIONS } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorSchemas as coreSchemas } from "./operator-openapi-schemas";
import { contentPaths, contentSchemas } from "./operator-openapi-content";
import { envelope, errors, idParam, int, object, op, pagedEnvelope, ref, str } from "./operator-openapi-shared";

export const operatorSchemas: Record<string, unknown> = { ...coreSchemas, ...contentSchemas };

const domainParam = {
  name: "domain",
  in: "query",
  required: true,
  description: "Operator domain the approval belongs to; the caller needs `<domain>:manage`.",
  schema: { type: "string", enum: [...OPERATOR_DOMAINS] },
};
const pageParams = [{ name: "cursor", in: "query", schema: str }, { name: "limit", in: "query", schema: int }];
const approvalId = { type: "string", description: "Approved, unconsumed approval requested by this operator for exactly these arguments" };
const capability = { type: "string", pattern: "^[a-z_]+:manage$", description: "Exact capability, e.g. `courses:manage`; there is no wildcard" };

const corePaths: Record<string, unknown> = {
  "/api/v1/operator/approvals": {
    get: {
      ...op("List approvals of a domain", "Newest first, with the canonical `args` behind `argsHash`. `?status=` pending (default, not expired), approved, rejected, consumed or expired.", {
        params: [domainParam, { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected", "consumed", "expired"], default: "pending" } }, ...pageParams],
      }),
      responses: { "200": { description: "Approvals", content: pagedEnvelope({ type: "array", items: ref("OperatorApprovalDetail") }) }, ...errors(400, 401, 403) },
    },
    post: op(
      "Request an approval",
      "For a sensitive action of `?domain=`. A different operator must approve it; it expires after `ttlMinutes` (default 30) and is consumed once by the requester. `operator.grant` and `operator.revoke` take `target: { userId, capability }`.",
      {
        params: [domainParam],
        body: object(
          {
            action: { type: "string", enum: [...OPERATOR_APPROVAL_ACTIONS] },
            target: { type: "object", additionalProperties: { type: "string" } },
            reason: str,
            ttlMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          },
          ["action", "target", "reason"]
        ),
        status: "201",
        data: ref("OperatorApproval"),
      }
    ),
  },
  "/api/v1/operator/approvals/{id}": {
    get: op("Get an approval", "Action, resource, canonical `args`, reason, requester and effective status. Approvals of another domain answer 404.", {
      params: [idParam, domainParam],
      data: ref("OperatorApprovalDetail"),
    }),
  },
  "/api/v1/operator/approvals/{id}/decision": {
    post: op("Decide an approval", "Approve or reject; never one's own request.", {
      params: [idParam, domainParam],
      body: object({ decision: { type: "string", enum: ["approve", "reject"] } }, ["decision"]),
    }),
  },
  "/api/v1/operator/system/audit": {
    get: {
      ...op("Read the whole operator audit trail", "Every domain, newest first; `?resource=` exact resource string. Needs `system:manage`.", {
        params: [{ name: "resource", in: "query", schema: str }, ...pageParams],
      }),
      responses: { "200": { description: "Audit rows", content: pagedEnvelope({ type: "array", items: ref("OperatorAuditRow") }) }, ...errors(400, 401, 403) },
    },
  },
  "/api/v1/operator/system/operators": {
    get: {
      ...op("List operator grants", "Live grants first, newest first. Needs `system:manage`."),
      responses: { "200": { description: "Grants", content: envelope({ type: "array", items: ref("OperatorGrant") }) }, ...errors(401, 403) },
    },
    post: op("Grant an operator capability", "Sensitive (`operator.grant`) and session-only: an MCP delegation is refused with `session_required`.", {
      body: object({ userId: str, capability, approvalId, note: { type: "string", maxLength: 500 } }, ["userId", "capability", "approvalId"]),
      status: "201",
    }),
  },
  "/api/v1/operator/system/operators/revoke": {
    post: op("Revoke an operator capability", "Sensitive (`operator.revoke`) and session-only. `not_granted` (409) when the user does not hold the capability.", {
      body: object({ userId: str, capability, approvalId }, ["userId", "capability", "approvalId"]),
    }),
  },
};

export const operatorPaths: Record<string, unknown> = { ...corePaths, ...contentPaths };
