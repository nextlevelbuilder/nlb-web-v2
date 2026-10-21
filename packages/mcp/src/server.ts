import {
  McpServer,
  fromJsonSchema,
  requireScopes,
  type CallToolResult,
  type JsonSchemaType,
  type StandardSchemaWithJSON,
  type ToolAnnotations
} from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { TOOLS, type McpToolDefinition } from "./tools/index.js";
import {
  ToolError,
  isMutatingTool,
  isPrivateReadTool,
  requiredToolScope,
  type ToolContext
} from "./tool-context.js";

export const SERVER_NAME = "nlb-directory-mcp";
/** Must match packages/mcp/package.json "version" (asserted by tests/server.test.ts). */
export const SERVER_VERSION = "0.2.1";

/** Tools that mutate remote state; unauthenticated HTTP callers may not run them. */
export const MUTATING_TOOLS: ReadonlySet<string> = new Set(TOOLS.map((tool) => tool.name).filter(isMutatingTool));

/** Tools whose effect cannot be undone by another call (advertised as destructive). */
const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set(["revoke_api_key", "blog_archive_post"]);

/** Whether an HTTP caller must prove an identity (OAuth or the Worker token) before running the tool. */
export function toolRequiresIdentity(name: string): boolean {
  return MUTATING_TOOLS.has(name) || isPrivateReadTool(name) || requiredToolScope(name) !== "mcp:read";
}

/**
 * Who is calling, resolved by the transport before the server is built.
 * - `local`: stdio; trusted process credentials from the environment, no gating.
 * - `anonymous` / `worker`: HTTP without OAuth; `worker` presented WORKER_AUTH_TOKEN.
 * - `oauth`: HTTP with a verified access token; `contextFor` mints the per-tool context.
 */
export type McpCaller =
  | { kind: "local" }
  | { kind: "anonymous"; env: NonNullable<ToolContext["env"]>; fetch?: typeof fetch }
  | { kind: "worker"; env: NonNullable<ToolContext["env"]>; fetch?: typeof fetch }
  | { kind: "oauth"; subject: string; scopes: string[]; contextFor: (toolName: string) => ToolContext };

/** Denial of an HTTP caller that lacks the identity a tool needs. */
export class ToolAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}

/** Resolves the ToolContext for one tool call, enforcing the authorization rules for that caller. */
export function toolContextFor(caller: McpCaller, toolName: string, args: Record<string, unknown>): ToolContext | undefined {
  switch (caller.kind) {
    case "local":
      return undefined;
    case "worker":
      return { workerAuth: true, env: caller.env, ...(caller.fetch ? { fetch: caller.fetch } : {}) };
    case "anonymous":
      if (MUTATING_TOOLS.has(toolName)) {
        throw new ToolAuthorizationError(`Unauthorized: Tool '${toolName}' performs remote mutation and requires a valid Worker authorization token.`);
      }
      if (isPrivateReadTool(toolName)) {
        throw new ToolAuthorizationError(toolName === "get_product_traffic"
          ? "Unauthorized: Private product traffic requires a valid Worker authorization token."
          : `Unauthorized: Tool '${toolName}' reads private data and requires a valid Worker authorization token.`);
      }
      return { workerAuth: false, env: caller.env, ...(caller.fetch ? { fetch: caller.fetch } : {}) };
    case "oauth": {
      // The HTTP layer already answered 403 for a missing scope; this re-check keeps the rule local to the call.
      if (!caller.scopes.includes(requiredToolScope(toolName))) throw new ToolAuthorizationError("Insufficient OAuth scope");
      const context = caller.contextFor(toolName);
      if (args.api_key !== undefined || args.session_cookie !== undefined ||
          (args.api_url !== undefined && args.api_url !== context.env?.NLB_API_URL)) {
        throw new ToolAuthorizationError("OAuth calls cannot override API URL or user credentials");
      }
      return context;
    }
  }
}

function annotationsFor(tool: McpToolDefinition): ToolAnnotations {
  const readOnly = !MUTATING_TOOLS.has(tool.name) &&
    (requiredToolScope(tool.name) === "mcp:read" || /^(list|get)_/.test(tool.name));
  const defaults: ToolAnnotations = readOnly
    ? { readOnlyHint: true }
    : { readOnlyHint: false, destructiveHint: DESTRUCTIVE_TOOLS.has(tool.name) };
  // A definition may carry its own hints; they win over the derived defaults.
  const own = (tool as McpToolDefinition & { annotations?: ToolAnnotations }).annotations;
  return own ? { ...defaults, ...own } : defaults;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function successResult(output: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) ?? "null" }],
    ...(isPlainObject(output) ? { structuredContent: output } : {}),
    isError: false
  };
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const payload = error instanceof ToolError ? { ...error.data, error: message } : { error: message };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
}

// One validator for all tools: @cfworker/json-schema runs on workerd and Node without code generation.
const validator = new CfWorkerJsonSchemaValidator();

type ToolInputSchema = StandardSchemaWithJSON<Record<string, unknown>, Record<string, unknown>>;

/** Same advertised schema, but accepts any input: used only when the call will be refused anyway. */
function acceptAnyInput(schema: ToolInputSchema): ToolInputSchema {
  return { "~standard": { ...schema["~standard"], validate: (value) => ({ value: value as Record<string, unknown> }) } };
}

/** Anonymous HTTP callers are refused mutating and private tools before their input is validated. */
function refusedBeforeValidation(caller: McpCaller, name: string): boolean {
  return caller.kind === "anonymous" && (MUTATING_TOOLS.has(name) || isPrivateReadTool(name));
}

/**
 * Builds a fresh MCP server exposing every tool in TOOLS, in registry order.
 * The same factory serves 2026-07-28 (stateless) and 2025-era clients over HTTP and stdio.
 */
export function createNlbMcpServer(caller: McpCaller = { kind: "local" }): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: { listChanged: false } } });
  for (const tool of TOOLS) {
    // McpToolDefinition.inputSchema is plain JSON Schema; its loose property map is narrower than the SDK's JSONSchema type.
    const schema = fromJsonSchema<Record<string, unknown>>(tool.inputSchema as JsonSchemaType, validator);
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: refusedBeforeValidation(caller, tool.name) ? acceptAnyInput(schema) : schema,
      annotations: annotationsFor(tool),
      // HTTP 403 insufficient_scope before invocation when an OAuth token lacks the tool's scope.
      scopeChallenge: requireScopes(requiredToolScope(tool.name))
    }, async (args) => {
      const toolArgs = isPlainObject(args) ? args : {};
      try {
        const context = toolContextFor(caller, tool.name, toolArgs);
        return successResult(await tool.handler(toolArgs, context));
      } catch (error) {
        return errorResult(error);
      }
    });
  }
  return server;
}
