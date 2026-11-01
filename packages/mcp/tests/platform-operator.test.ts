import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOLS, type McpToolDefinition } from "../src/tools/index.js";
import {
  PLATFORM_OPERATOR_READ_TOOLS,
  PLATFORM_OPERATOR_WRITE_TOOLS,
  ToolError,
  isMutatingTool,
  isPrivateReadTool,
  requiredToolScope,
  type ToolContext
} from "../src/tool-context.js";
import { MAX_OPERATOR_RESPONSE_CHARS } from "../src/tools/operator-http.js";
import { ToolAuthorizationError, createNlbMcpServer, toolContextFor, type McpCaller } from "../src/server.js";

const API = "https://staging.nextlevelbuilder.io";
const ENV = { NLB_API_KEY: "nlb_live_member", NLB_API_URL: API };

function tool(name: string): McpToolDefinition {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function mockFetch(body: unknown = { data: {} }, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }));
}

function call(fetchFn: ReturnType<typeof mockFetch>, index = 0) {
  const [url, init] = fetchFn.mock.calls[index] as unknown as [string, RequestInit];
  return { url: new URL(url), init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

function worker(fetchFn: ReturnType<typeof mockFetch>): ToolContext {
  return { workerAuth: true, env: ENV, fetch: fetchFn as unknown as typeof fetch };
}

function oauth(scopes: string[], fetchFn?: ReturnType<typeof mockFetch>): McpCaller {
  return {
    kind: "oauth",
    subject: "user_1",
    scopes,
    contextFor: () => ({ oauth: { subject: "user_1", scopes }, env: { NLB_API_URL: API }, ...(fetchFn ? { fetch: fetchFn as unknown as typeof fetch } : {}) })
  };
}

async function failure(promise: Promise<unknown>): Promise<ToolError> {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(ToolError);
  return err as ToolError;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("platform operator MCP tools", () => {
  const all = [...PLATFORM_OPERATOR_READ_TOOLS, ...PLATFORM_OPERATOR_WRITE_TOOLS];

  it("registers every operator_* tool under mcp:operator, reads private and writes mutating", () => {
    const registered = TOOLS.map((t) => t.name).filter((name) => name.startsWith("operator_"));
    expect([...registered].sort()).toEqual([...all].sort());
    for (const name of all) expect(requiredToolScope(name)).toBe("mcp:operator");
    for (const name of PLATFORM_OPERATOR_READ_TOOLS) expect([isPrivateReadTool(name), isMutatingTool(name)]).toEqual([true, false]);
    for (const name of PLATFORM_OPERATOR_WRITE_TOOLS) expect(isMutatingTool(name)).toBe(true);
  });

  it("keeps platform product management apart from the public list_products tool", () => {
    expect(requiredToolScope("list_products")).toBe("mcp:read");
    expect(isPrivateReadTool("list_products")).toBe(false);
    expect(tool("operator_directory_list_products").description).toContain("list_products");
  });

  it("advertises reads as read-only and the refund as destructive", () => {
    const server = createNlbMcpServer();
    const tools = (server as unknown as { _registeredTools: Record<string, { annotations?: Record<string, unknown> }> })._registeredTools;
    for (const name of PLATFORM_OPERATOR_READ_TOOLS) expect(tools[name].annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.operator_commerce_refund_order.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools.operator_approvals_decide.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("refuses anonymous HTTP callers and OAuth tokens without mcp:operator before any request", () => {
    const anonymous: McpCaller = { kind: "anonymous", env: ENV };
    for (const name of ["operator_users_list", "operator_commerce_refund_order"]) {
      expect(() => toolContextFor(anonymous, name, {})).toThrow(ToolAuthorizationError);
      expect(() => toolContextFor(oauth(["mcp:read", "mcp:write", "mcp:keys"]), name, {})).toThrow(/Insufficient OAuth scope/);
    }
    expect(toolContextFor(oauth(["mcp:operator"]), "operator_users_list", {})?.oauth?.subject).toBe("user_1");
  });

  it("refuses OAuth calls that try to override the API URL or pass a session cookie", () => {
    const caller = oauth(["mcp:operator"]);
    expect(() => toolContextFor(caller, "operator_commerce_list_orders", { api_url: "https://evil.example" })).toThrow(/cannot override/);
    expect(() => toolContextFor(caller, "operator_commerce_list_orders", { session_cookie: "better-auth.session_token=x" })).toThrow(/cannot override/);
    expect(() => toolContextFor(caller, "operator_commerce_list_orders", { api_key: "nlb_live_member" })).toThrow(/cannot override/);
  });

  it("refuses anonymous Worker callers in the handler too", async () => {
    const fetchFn = mockFetch();
    const err = await failure(tool("operator_commerce_list_orders").handler({}, { workerAuth: false, env: ENV, fetch: fetchFn as unknown as typeof fetch }));
    expect(err.data.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends the operator session cookie and never the configured API key", async () => {
    const fetchFn = mockFetch({ data: [] });
    await tool("operator_commerce_list_orders").handler({ user_id: "u 1", status: "paid", limit: 10, session_cookie: "better-auth.session_token=abc" }, worker(fetchFn));
    const sent = call(fetchFn);
    expect(sent.url.origin).toBe(API);
    expect(sent.url.pathname).toBe("/api/v1/operator/commerce/orders");
    expect(Object.fromEntries(sent.url.searchParams)).toEqual({ userId: "u 1", status: "paid", limit: "10" });
    expect(sent.headers.Cookie).toBe("better-auth.session_token=abc");
    expect(sent.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(sent.headers)).not.toContain("nlb_live_member");
  });

  it("never sends a cookie on OAuth calls (the transport's fetch adds the delegation)", async () => {
    vi.stubEnv("NLB_SESSION_COOKIE", "better-auth.session_token=env");
    const fetchFn = mockFetch({ data: {} });
    const context = toolContextFor(oauth(["mcp:operator"], fetchFn), "operator_users_get", { user_id: "u1" });
    await tool("operator_users_get").handler({ user_id: "u1" }, context);
    expect(call(fetchFn).headers.Cookie).toBeUndefined();
  });

  it("refuses an api_url outside the allowlist before any request", async () => {
    const fetchFn = mockFetch();
    await expect(tool("operator_users_list").handler({ api_url: "https://evil.example" }, worker(fetchFn))).rejects.toThrow(/disallowed/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("validates arguments locally: unknown keys, missing ids and out-of-range limits never reach the API", async () => {
    const fetchFn = mockFetch();
    const unknown = await failure(tool("operator_users_list").handler({ email: "a@b.c" }, worker(fetchFn)));
    expect(unknown.data.details).toEqual([{ path: "email", message: "Unknown argument" }]);
    const missing = await failure(tool("operator_commerce_refund_order").handler({ order_id: "o1", reason: "duplicate", amount: null }, worker(fetchFn)));
    expect(missing.data.details).toEqual([{ path: "approvalId", message: "Required" }]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(tool("operator_users_list").inputSchema.properties.limit).toMatchObject({ maximum: 100 });
  });

  it.each([
    ["operator_commerce_get_order", { order_id: "o/1" }, "GET", "/api/v1/operator/commerce/orders/o%2F1", {}],
    ["operator_commerce_list_webhook_failures", { status: "pending" }, "GET", "/api/v1/operator/commerce/webhooks", { status: "pending" }],
    ["operator_users_list", { q: "duy", limit: 5 }, "GET", "/api/v1/operator/users", { q: "duy", limit: "5" }],
    ["operator_users_get", { user_id: "u1" }, "GET", "/api/v1/operator/users/u1", {}],
    ["operator_users_list_orgs", { q: "nlb" }, "GET", "/api/v1/operator/users/orgs", { q: "nlb" }],
    ["operator_users_get_org", { org_id: "org1" }, "GET", "/api/v1/operator/users/orgs/org1", {}],
    ["operator_membership_list_entitlements", { user_id: "u1" }, "GET", "/api/v1/operator/membership/users/u1", {}],
    ["operator_directory_list_products", { status: "in_review" }, "GET", "/api/v1/operator/directory/products", { status: "in_review" }],
    ["operator_directory_list_moderation", { status: "open", limit: 20 }, "GET", "/api/v1/operator/directory/moderation", { status: "open", limit: "20" }],
    ["operator_approvals_list", { domain: "commerce", status: "approved" }, "GET", "/api/v1/operator/approvals", { domain: "commerce", status: "approved" }],
    ["operator_approvals_get", { domain: "commerce", approval_id: "ap1" }, "GET", "/api/v1/operator/approvals/ap1", { domain: "commerce" }]
  ] as const)("%s calls %s %s", async (name, args, method, path, query) => {
    const fetchFn = mockFetch({ data: {} });
    await tool(name).handler({ ...args }, worker(fetchFn));
    const sent = call(fetchFn);
    expect(sent.init.method).toBe(method);
    expect(sent.url.pathname).toBe(path);
    expect(Object.fromEntries(sent.url.searchParams)).toEqual(query);
    expect(sent.body).toBeUndefined();
  });

  it("requests a refund approval bound to the exact order, reason and amount", async () => {
    const fetchFn = mockFetch({ data: { id: "ap1", status: "pending" } }, 201);
    const target = { orderId: "o1", reason: "duplicate", amount: 500 };
    await tool("operator_approvals_request").handler({ domain: "commerce", action: "commerce.order.refund", target, reason: "Charged twice" }, worker(fetchFn));
    const sent = call(fetchFn);
    expect(sent.init.method).toBe("POST");
    expect(sent.url.pathname).toBe("/api/v1/operator/approvals");
    expect(Object.fromEntries(sent.url.searchParams)).toEqual({ domain: "commerce" });
    expect(sent.body).toEqual({ action: "commerce.order.refund", target, reason: "Charged twice" });
    expect(tool("operator_approvals_request").inputSchema.properties.action).toMatchObject({ enum: ["commerce.order.refund"] });
  });

  it("decides an approval in its domain", async () => {
    const fetchFn = mockFetch({ data: { id: "ap1", status: "approved" } });
    await tool("operator_approvals_decide").handler({ domain: "commerce", approval_id: "ap1", decision: "approve" }, worker(fetchFn));
    const sent = call(fetchFn);
    expect(sent.url.pathname).toBe("/api/v1/operator/approvals/ap1/decision");
    expect(Object.fromEntries(sent.url.searchParams)).toEqual({ domain: "commerce" });
    expect(sent.body).toEqual({ decision: "approve" });
  });

  it("forwards the refund with its approval and a null amount for a full refund", async () => {
    const fetchFn = mockFetch({ data: { status: "requested" } }, 202);
    await tool("operator_commerce_refund_order").handler({ order_id: "o1", approvalId: "ap1", reason: "duplicate", amount: null, comment: "dup" }, worker(fetchFn));
    const sent = call(fetchFn);
    expect(sent.init.method).toBe("POST");
    expect(sent.url.pathname).toBe("/api/v1/operator/commerce/orders/o1/refund");
    expect(sent.body).toEqual({ approvalId: "ap1", reason: "duplicate", amount: null, comment: "dup" });
  });

  it("surfaces approval_required and other API errors as structured errors", async () => {
    const fetchFn = mockFetch({ error: { code: "approval_required", message: "Approval required" } }, 409);
    const err = await failure(tool("operator_commerce_refund_order").handler({ order_id: "o1", approvalId: "ap1", reason: "duplicate", amount: 100 }, worker(fetchFn)));
    expect(err.message).toContain("HTTP 409 approval_required");
    expect(err.data).toMatchObject({ status: 409, code: "approval_required" });
    expect(err.data.hint).toBeUndefined();
  });

  it("names the domain grant in the hint when an OAuth caller is not an operator of that domain", async () => {
    const fetchFn = mockFetch({ error: { code: "not_operator", message: "Operator access required" } }, 403);
    const context = toolContextFor(oauth(["mcp:operator"], fetchFn), "operator_membership_list_entitlements", {});
    const err = await failure(tool("operator_membership_list_entitlements").handler({ user_id: "u1" }, context));
    expect(err.data).toMatchObject({ status: 403, code: "not_operator" });
    expect(String(err.data.hint)).toContain("membership:manage");
  });

  it("refuses oversized responses instead of returning them", async () => {
    const fetchFn = mockFetch({ data: [{ blob: "x".repeat(MAX_OPERATOR_RESPONSE_CHARS) }] });
    const err = await failure(tool("operator_users_list").handler({}, worker(fetchFn)));
    expect(err.data).toMatchObject({ code: "response_too_large" });
  });
});
