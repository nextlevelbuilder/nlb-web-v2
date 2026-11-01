/** Helpers shared by the platform operator OpenAPI path modules. */
export const OPERATOR_TAG = "Platform operators";

/** Operator calls: a session, or an MCP delegation carrying `mcp:operator`. API keys are refused. */
export const OPERATOR_AUTH = [{ SessionAuth: [] }];

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const json = (schema: unknown) => ({ "application/json": { schema } });
export const envelope = (data: unknown) => json({ type: "object", properties: { data } });
export const pagedEnvelope = (data: unknown) =>
  json({ type: "object", properties: { data, pagination: { type: "object", properties: { nextCursor: { type: ["string", "null"] }, limit: { type: "integer" } } } } });

export const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, required, properties });
export const str = { type: "string" };
export const int = { type: "integer" };
export const anyData = { type: "object", additionalProperties: true };
export const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

const ERROR_TEXT: Record<number, string> = {
  400: "Invalid input (`validation_failed`, `invalid_input`, `invalid_json`)",
  401: "Sign in required (`unauthenticated`), or a delegation without `mcp:operator`",
  403: "Denied by policy (`banned`, `credential_not_allowed`, `not_operator`, `missing_capability`, `session_required`) or cross-site",
  404: "Not found",
  409: "Conflict with the current state, or an approval that is missing, not approved, expired, consumed, self-decided or bound to other arguments",
  422: "The domain refused the change",
  502: "An upstream provider failed",
};

/** Standard error responses (`{ error: { code, message } }`) for the given statuses. */
export function errors(...statuses: number[]): Record<string, { description: string; content: unknown }> {
  return Object.fromEntries(statuses.map((status) => [String(status), { description: ERROR_TEXT[status] ?? "Error", content: json(ref("OperatorError")) }]));
}

/** One operator operation with the standard auth, envelope and error responses. */
export function op(summary: string, description: string, options: { body?: unknown; params?: unknown[]; status?: string; data?: unknown; extra?: Record<string, unknown> } = {}) {
  return {
    summary,
    description,
    tags: [OPERATOR_TAG],
    security: OPERATOR_AUTH,
    ...(options.params ? { parameters: options.params } : {}),
    ...(options.body ? { requestBody: { required: true, content: json(options.body) } } : {}),
    responses: {
      [options.status ?? "200"]: { description: "OK", content: envelope(options.data ?? anyData) },
      ...errors(400, 401, 403, 404, 409),
      ...(options.extra ?? {}),
    },
  };
}
