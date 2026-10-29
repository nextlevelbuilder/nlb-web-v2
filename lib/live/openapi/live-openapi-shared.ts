/** Helpers shared by the NLB Live OpenAPI path modules. */
export const LIVE_MEMBER_TAG = "NLB Live";
export const LIVE_OPERATOR_TAG = "NLB Live: Operators";

/** Public reads: no credential needed; a session, API key or MCP delegation is accepted. */
export const PUBLIC_AUTH = [{}, { SessionAuth: [] }, { BearerAuth: [] }, { ApiKeyAuth: [] }];
/** Member calls: session, API key or MCP delegation (`mcp:read` / `mcp:write`). */
export const CALLER_AUTH = [{ SessionAuth: [] }, { BearerAuth: [] }, { ApiKeyAuth: [] }];
/** Operator calls: a session, or an MCP delegation carrying `mcp:operator`. API keys are refused. */
export const OPERATOR_AUTH = [{ SessionAuth: [] }];

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const json = (schema: unknown) => ({ "application/json": { schema } });
export const envelope = (data: unknown) => json({ type: "object", properties: { data } });
export const pagedEnvelope = (data: unknown) =>
  json({ type: "object", properties: { data, pagination: { type: "object", properties: { nextCursor: { type: ["string", "null"] }, limit: { type: "integer" } } } } });

export const slugParam = { name: "slug", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } };
export const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

const ERROR_TEXT: Record<number, string> = {
  400: "Invalid input (`validation_failed`, `invalid_input`, `invalid_json`)",
  401: "Sign in required (`unauthenticated`)",
  403: "Denied by policy (`banned`, `email_unverified`, `insufficient_scope`, `credential_not_allowed`, `not_operator`, `missing_capability`) or cross-site",
  404: "Not found, or hidden while `LIVE_ENABLED` is off",
  409: "Conflict with the current state",
  429: "Rate limited",
};

/** Standard error responses (`{ error: { code, message } }`) for the given statuses. */
export function errors(...statuses: number[]): Record<string, { description: string; content: unknown }> {
  return Object.fromEntries(statuses.map((status) => [String(status), { description: ERROR_TEXT[status] ?? "Error", content: json(ref("LiveError")) }]));
}
