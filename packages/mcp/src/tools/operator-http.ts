import { BuilderEnvelopeSchema, BuilderErrorSchema } from "@nextlevelbuilder/contracts";
import { ToolError, type ToolContext } from "../tool-context.js";
import type { McpToolDefinition, resolveToolEnv } from "./index.js";

/**
 * Request plumbing shared by the operator tool families (NLB Live and `/api/v1/operator/*`). Operator
 * routes refuse API keys, so a call carries either the OAuth delegation added by the transport's fetch or
 * an operator session cookie (stdio and Worker callers only). The web checks the `<domain>:manage` grant.
 */

type ResolveToolEnv = typeof resolveToolEnv;
export type JsonSchemaProps = Record<string, unknown>;
export type Args = Record<string, unknown>;

/** Tool arguments that select the endpoint and credentials rather than the request itself. */
const CREDENTIAL_KEYS = ["api_url", "session_cookie"] as const;

export const operatorCredentialProps: JsonSchemaProps = {
  api_url: { type: "string", description: "Allowed directory API endpoint (optional)" },
  session_cookie: {
    type: "string",
    description: "Operator's Better Auth session cookie (or NLB_SESSION_COOKIE) for stdio and Worker callers. OAuth calls act as the signed-in operator and refuse it. API keys are refused."
  }
};

/** Responses larger than this are refused instead of flooding the model's context; narrow the filter. */
export const MAX_OPERATOR_RESPONSE_CHARS = 512 * 1024;

export interface OperatorCall {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** The path names one item, so a 404 means it does not exist. */
  resource?: boolean;
}

export interface OperatorApi {
  /** Used in error messages, e.g. "NLB Live operator API". */
  label: string;
  /** Capability named in the 401 hint for OAuth callers, e.g. "live:manage". */
  capability: string;
}

export function isAnonymousWorker(context?: ToolContext): boolean {
  return context !== undefined && !context.oauth && context.workerAuth !== true;
}

export function refuseAnonymousWorker(name: string, context?: ToolContext): void {
  if (isAnonymousWorker(context)) {
    throw new ToolError(`Unauthorized: Tool '${name}' is for platform operators and requires a valid Worker authorization token.`, { status: 401 });
  }
}

function resolveSessionCookie(args: Args, context?: ToolContext): string | undefined {
  if (context?.oauth) return undefined;
  if (typeof args.session_cookie === "string" && args.session_cookie.trim()) return args.session_cookie.trim();
  return typeof process !== "undefined" ? process.env?.NLB_SESSION_COOKIE?.trim() || undefined : undefined;
}

/** Splits credentials from request arguments and refuses unknown or missing ones (the API refuses unknown body keys too). */
export function splitOperatorArgs(tool: string, inputSchema: McpToolDefinition["inputSchema"], args: Args): { credentials: Args; rest: Args } {
  const credentials: Args = {};
  const rest: Args = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if ((CREDENTIAL_KEYS as readonly string[]).includes(key)) {
      if (value !== undefined && typeof value !== "string") throw new ToolError(`Invalid arguments: ${key} must be a string`, { details: [{ path: key, message: "Expected string" }] });
      credentials[key] = value;
    } else if (key in inputSchema.properties) {
      if (value !== undefined) rest[key] = value;
    } else {
      unknown.push(key);
    }
  }
  const missing = (inputSchema.required ?? []).filter((key) => rest[key] === undefined);
  const details = [
    ...unknown.map((path) => ({ path, message: "Unknown argument" })),
    ...missing.map((path) => ({ path, message: "Required" }))
  ];
  if (details.length) {
    throw new ToolError(`Invalid arguments for ${tool}: ${details.map((d) => `${d.path}: ${d.message}`).join("; ")}`, { details });
  }
  return { credentials, rest };
}

export async function operatorRequest(
  api: OperatorApi,
  resolveEnv: ResolveToolEnv,
  credentials: Args,
  context: ToolContext | undefined,
  call: OperatorCall
): Promise<unknown> {
  // The configured API key is never sent: operator routes refuse API keys outright.
  const { apiUrl } = resolveEnv({ api_url: credentials.api_url }, context);
  const headers: Record<string, string> = { Accept: "application/json" };
  const cookie = resolveSessionCookie(credentials, context);
  if (cookie) headers.Cookie = cookie;
  if (call.body !== undefined) headers["Content-Type"] = "application/json";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(call.query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.size ? `?${params.toString()}` : "";

  const response = await (context?.fetch ?? fetch)(`${apiUrl}${call.path}${search}`, {
    method: call.method,
    headers,
    body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    const parsed = BuilderErrorSchema.safeParse(json);
    const code = parsed.success ? parsed.data.error.code : undefined;
    const message = parsed.success
      ? parsed.data.error.message
      : response.status === 404 && call.resource ? "Not found" : (text.trim().slice(0, 500) || response.statusText || "Request failed");
    const data: Record<string, unknown> = { status: response.status };
    if (code !== undefined) data.code = code;
    if (parsed.success && parsed.data.error.details !== undefined) data.details = parsed.data.error.details;
    if (response.status === 401 || code === "not_operator") {
      data.hint = context?.oauth
        ? `This account needs an unrevoked ${api.capability} operator grant and a connection authorized with mcp:operator. Reconnect the MCP client after the grant is added.`
        : "Operator tools need an operator's signed-in session cookie (session_cookie or NLB_SESSION_COOKIE), or OAuth with mcp:operator.";
    }
    throw new ToolError(`${api.label} error (HTTP ${response.status}${code ? ` ${code}` : ""}: ${message})`, data);
  }
  if (json === undefined) throw new Error(`${api.label} returned a non-JSON response for ${call.path}`);
  if (text.length > MAX_OPERATOR_RESPONSE_CHARS) {
    throw new ToolError(`${api.label} response for ${call.path} is too large (${text.length} characters); lower limit or narrow the filter`, { code: "response_too_large", maxChars: MAX_OPERATOR_RESPONSE_CHARS });
  }
  const envelope = BuilderEnvelopeSchema.safeParse(json);
  if (!envelope.success) throw new Error(`${api.label} response schema mismatch for ${call.path}: ${envelope.error.message}`);
  return json;
}

const enc = encodeURIComponent;
export const pathId = (value: unknown) => enc(String(value));

// --- JSON Schema fragments ---

export const idProp = (description: string) => ({ type: "string", minLength: 1, maxLength: 200, description });
export const limitProp = (max = 100) => ({ type: "integer", minimum: 1, maximum: max });

export function operatorSchema(properties: JsonSchemaProps, required: string[] = []): McpToolDefinition["inputSchema"] {
  return { type: "object", properties: { ...properties, ...operatorCredentialProps }, ...(required.length ? { required } : {}) };
}

/** Request arguments without the path id(s) the tool takes in snake_case. */
export function bodyOf(args: Args, ...pathKeys: string[]): Args {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !pathKeys.includes(key)));
}

/** Builds `define(name, description, schema, build)` for one operator API family. */
export function operatorToolFactory(api: OperatorApi, resolveEnv: ResolveToolEnv, authNote: string) {
  return function define(
    name: string,
    description: string,
    inputSchema: McpToolDefinition["inputSchema"],
    build: (args: Args) => OperatorCall
  ): McpToolDefinition {
    return {
      name,
      description: `${description} ${authNote}`,
      inputSchema,
      handler: async (args, context) => {
        refuseAnonymousWorker(name, context);
        const { credentials, rest } = splitOperatorArgs(name, inputSchema, args);
        return operatorRequest(api, resolveEnv, credentials, context, build(rest));
      }
    };
  };
}
