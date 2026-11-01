/** Component schemas of the platform operator API, merged additively into lib/openapi.ts. */
const str = { type: "string" };
const time = { type: "string", format: "date-time" };
const nullableStr = { type: ["string", "null"] };
const nullableTime = { type: ["string", "null"], format: "date-time" };

export const operatorSchemas: Record<string, unknown> = {
  OperatorError: {
    type: "object",
    required: ["error"],
    properties: { error: { type: "object", required: ["code", "message"], properties: { code: str, message: str } } },
  },
  OperatorApproval: {
    type: "object",
    properties: { id: str, status: { type: "string", const: "pending" }, action: str, resource: str, argsHash: str, expiresAt: time },
  },
  OperatorApprovalDetail: {
    type: "object",
    properties: {
      id: str, action: str, resource: str,
      args: { type: ["object", "null"], additionalProperties: true, description: "Canonical JSON arguments; sha256 of their canonical JSON is `argsHash`" },
      argsHash: str, reason: str, requestedBy: str,
      status: { type: "string", enum: ["pending", "approved", "rejected", "consumed", "expired"] },
      expiresAt: time, decidedBy: nullableStr, decidedAt: nullableTime, consumedAt: nullableTime,
    },
  },
  OperatorAuditRow: {
    type: "object",
    properties: {
      id: str, actorUserId: nullableStr, actorAuthType: str, clientId: nullableStr, action: str, resource: str,
      decision: { type: "string", enum: ["allow", "deny"] }, reason: nullableStr, argsHash: nullableStr, approvalId: nullableStr,
      details: { type: ["object", "null"], additionalProperties: true }, createdAt: time,
    },
  },
  OperatorGrant: {
    type: "object",
    properties: { userId: str, capabilities: { type: "array", items: str }, grantedBy: str, note: nullableStr, grantedAt: time, revokedAt: nullableTime, updatedAt: time },
  },
};
