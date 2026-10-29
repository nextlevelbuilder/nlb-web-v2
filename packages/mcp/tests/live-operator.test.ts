import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOLS, type McpToolDefinition } from "../src/tools/index.js";
import {
  LIVE_OPERATOR_READ_TOOLS,
  LIVE_OPERATOR_WRITE_TOOLS,
  ToolError,
  isMutatingTool,
  isPrivateReadTool,
  requiredToolScope,
  type ToolContext
} from "../src/tool-context.js";
import { createNlbMcpServer } from "../src/server.js";

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

async function failure(promise: Promise<unknown>): Promise<ToolError> {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(ToolError);
  return err as ToolError;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("NLB Live operator MCP tools", () => {
  const all = [...LIVE_OPERATOR_READ_TOOLS, ...LIVE_OPERATOR_WRITE_TOOLS];

  it("registers every operator tool under mcp:operator, reads private and writes mutating", () => {
    const registered = TOOLS.map((t) => t.name).filter((name) => name.startsWith("live_admin_"));
    expect([...registered].sort()).toEqual([...all].sort());
    for (const name of all) expect(requiredToolScope(name)).toBe("mcp:operator");
    for (const name of LIVE_OPERATOR_READ_TOOLS) expect([isPrivateReadTool(name), isMutatingTool(name)]).toEqual([true, false]);
    for (const name of LIVE_OPERATOR_WRITE_TOOLS) expect(isMutatingTool(name)).toBe(true);
  });

  it("advertises reads as read-only and refunds, cancellations and overrides as destructive", async () => {
    const server = createNlbMcpServer();
    const tools = (server as unknown as { _registeredTools: Record<string, { annotations?: Record<string, unknown> }> })._registeredTools;
    expect(tools.live_admin_list_events.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.live_admin_create_event.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    for (const name of ["live_admin_cancel_event", "live_admin_refund_ticket", "live_admin_override_round_winner"]) {
      expect(tools[name].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
  });

  it("refuses anonymous Worker callers before any request", async () => {
    const fetchFn = mockFetch();
    const err = await failure(tool("live_admin_list_events").handler({}, { workerAuth: false, env: ENV, fetch: fetchFn as unknown as typeof fetch }));
    expect(err.data.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends the operator session cookie and never the configured API key", async () => {
    const fetchFn = mockFetch({ data: [] });
    await tool("live_admin_list_approvals").handler({ status: "approved", limit: 10, session_cookie: "better-auth.session_token=abc" }, worker(fetchFn));
    const sent = call(fetchFn);
    expect(sent.url.pathname).toBe("/api/v1/live-admin/approvals");
    expect(Object.fromEntries(sent.url.searchParams)).toEqual({ status: "approved", limit: "10" });
    expect(sent.headers.Cookie).toBe("better-auth.session_token=abc");
    expect(sent.headers.Authorization).toBeUndefined();
    expect(sent.headers["x-api-key"]).toBeUndefined();
  });

  it("puts snake_case path ids in the path and keeps API field names in the body", async () => {
    const fetchFn = mockFetch();
    await tool("live_admin_refund_ticket").handler({ ticket_id: "t/1", approvalId: "ap_1", reason: "duplicate" }, worker(fetchFn));
    const sent = call(fetchFn);
    expect(sent.init.method).toBe("POST");
    expect(sent.url.pathname).toBe("/api/v1/live-admin/tickets/t%2F1/refund");
    expect(sent.body).toEqual({ approvalId: "ap_1", reason: "duplicate" });

    await tool("live_admin_update_event").handler({ event_id: "e1", capacity: 40 }, worker(fetchFn));
    expect(call(fetchFn, 1)).toMatchObject({ url: new URL(`${API}/api/v1/live-admin/events/e1`), body: { capacity: 40 } });
    expect(call(fetchFn, 1).init.method).toBe("PATCH");

    await tool("live_admin_open_event_sales").handler({ event_id: "e1" }, worker(fetchFn));
    expect(call(fetchFn, 2).body).toBeUndefined();
  });

  it("refuses unknown and missing arguments locally", async () => {
    const fetchFn = mockFetch();
    const unknown = await failure(tool("live_admin_cancel_event").handler({ event_id: "e1", force: true }, worker(fetchFn)));
    expect(unknown.data.details).toEqual([{ path: "force", message: "Unknown argument" }]);
    const missing = await failure(tool("live_admin_decide_approval").handler({ approval_id: "a1" }, worker(fetchFn)));
    expect(missing.data.details).toEqual([{ path: "decision", message: "Required" }]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces the API error code with an operator hint", async () => {
    const denied = mockFetch({ error: { code: "not_operator", message: "Operator access required" } }, 403);
    const err = await failure(tool("live_admin_list_events").handler({}, worker(denied)));
    expect(err.message).toContain("HTTP 403 not_operator");
    expect(err.data).toMatchObject({ status: 403, code: "not_operator" });
    expect(String(err.data.hint)).toContain("session cookie");

    const approval = mockFetch({ error: { code: "approval_required", message: "Approval required" } }, 409);
    expect((await failure(tool("live_admin_cancel_event").handler({ event_id: "e1" }, worker(approval)))).data.code).toBe("approval_required");
  });
});
