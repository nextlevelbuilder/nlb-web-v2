import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOLS, type McpToolDefinition } from "../src/tools/index.js";
import {
  BUILDER_READ_TOOLS,
  BUILDER_WRITE_TOOLS,
  ToolError,
  isMutatingTool,
  isPrivateReadTool,
  requiredToolScope,
  type ToolContext
} from "../src/tool-context.js";

const API = "https://staging.nextlevelbuilder.io";
const ENV = { NLB_API_KEY: "nlb_live_member", NLB_API_URL: API };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const evidence = {
  id: "ev_1", userId: "u1", projectId: "p1", eventType: "validate_interviews", stage: "validate",
  title: "Five interviews", summary: "Talked to five builders", occurredAt: "2026-11-02T00:00:00.000Z",
  links: ["https://example.com/notes"], files: [], counterpartyUserId: null, counterpartyConfirmedAt: null,
  status: "submitted", source: "agent", visibility: "private", clientKey: "k1", decision: null, eventId: null,
  appeal: null, createdAt: "2026-11-02T01:00:00.000Z", updatedAt: "2026-11-02T01:00:00.000Z"
};

function tool(name: string): McpToolDefinition {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }));
}

function call(fetchFn: ReturnType<typeof mockFetch>, index = 0) {
  const [url, init] = fetchFn.mock.calls[index] as unknown as [string, RequestInit];
  return { url: new URL(url), init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

function authed(fetchFn: ReturnType<typeof mockFetch>): ToolContext {
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

describe("Builder League MCP tools: registration and scopes", () => {
  it("registers every read and write tool with an input schema", () => {
    const names = TOOLS.map((t) => t.name);
    for (const name of [...BUILDER_READ_TOOLS, ...BUILDER_WRITE_TOOLS]) {
      expect(names).toContain(name);
      expect(tool(name).inputSchema.type).toBe("object");
    }
    expect(names.filter((n) => n.startsWith("builder_"))).toHaveLength(BUILDER_READ_TOOLS.length + BUILDER_WRITE_TOOLS.length);
  });

  it("maps reads to private mcp:read and writes to mcp:write", () => {
    for (const name of BUILDER_READ_TOOLS) {
      expect(requiredToolScope(name)).toBe("mcp:read");
      expect(isPrivateReadTool(name)).toBe(true);
    }
    for (const name of BUILDER_WRITE_TOOLS) {
      expect(requiredToolScope(name)).toBe("mcp:write");
      expect(isMutatingTool(name)).toBe(true);
    }
  });

  it("never exposes verification, approval or award actions to agents", () => {
    const names = TOOLS.map((t) => t.name);
    for (const forbidden of ["builder_confirm_evidence", "builder_admin_decide", "builder_admin_resolve_appeal", "builder_claim_reward", "builder_admin_backfill"]) {
      expect(names).not.toContain(forbidden);
    }
    const submitProps = Object.keys(tool("builder_submit_evidence").inputSchema.properties);
    for (const field of ["verification", "status", "source", "decision", "approve"]) expect(submitProps).not.toContain(field);
    for (const t of TOOLS.filter((x) => x.name.startsWith("builder_"))) {
      expect(JSON.stringify(t.inputSchema)).not.toMatch(/moderator_verified|system_verified|peer_confirmed/);
    }
  });
});

describe("Builder League MCP tools: requests", () => {
  it("submits self-reported evidence with the member key and an idempotency key", async () => {
    const fetchFn = mockFetch({ data: evidence }, 201);
    const input = { eventType: "validate_interviews", title: "Five interviews", occurredAt: "2026-11-02", links: ["https://example.com/notes"], projectId: "p1", clientKey: "k1" };
    const result = await tool("builder_submit_evidence").handler(input, authed(fetchFn));
    expect(result).toEqual({ data: evidence });
    const c = call(fetchFn);
    expect(`${c.init.method} ${c.url.href}`).toBe(`POST ${API}/api/v1/builder-evidence`);
    expect(c.body).toEqual(input);
    expect(c.headers).toMatchObject({ Authorization: "Bearer nlb_live_member", "Idempotency-Key": "k1", "Content-Type": "application/json" });
  });

  it("rejects a verification level, status or source before any request", async () => {
    const fetchFn = mockFetch({ data: evidence });
    const base = { eventType: "build_mvp", title: "MVP live", occurredAt: "2026-11-02" };
    for (const forged of [{ verification: "moderator_verified" }, { status: "approved" }, { source: "moderator" }]) {
      const err = await failure(tool("builder_submit_evidence").handler({ ...base, ...forged }, authed(fetchFn)));
      expect(err.message).toMatch(/Unrecognized key/);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("builds query strings and paths for reads", async () => {
    const fetchFn = mockFetch({ data: [], pagination: { nextCursor: null, limit: 5 } });
    const ctx = authed(fetchFn);
    await tool("builder_list_evidence").handler({ status: "rejected", limit: 5, cursor: "abc" }, ctx);
    await tool("builder_get_rankings").handler({ board: "ship", period: "month", key: "2026-10" }, ctx);
    await tool("builder_get_journey").handler({ limit: 10, project: "p1" }, ctx);
    await tool("builder_list_missions").handler({ locale: "vi" }, ctx);
    await tool("builder_get_passport").handler({ user_id: "u 1" }, ctx);
    await tool("builder_get_year").handler({ year: 2026 }, ctx);
    await tool("builder_get_time_capsule").handler({}, ctx);
    const seen = fetchFn.mock.calls.map((_, i) => { const c = call(fetchFn, i); return `${c.init.method} ${c.url.pathname}${c.url.search}`; });
    expect(seen).toEqual([
      "GET /api/v1/builder-evidence?status=rejected&limit=5&cursor=abc",
      "GET /api/v1/builder-rankings?board=ship&period=month&key=2026-10",
      "GET /api/v1/builder-journey?limit=10&project=p1",
      "GET /api/v1/builder-missions?locale=vi",
      "GET /api/v1/builder-passport/u%201",
      "GET /api/v1/builder-year/2026",
      "GET /api/v1/builder-time-capsule"
    ]);
    for (let i = 0; i < seen.length; i++) expect(call(fetchFn, i).headers["Idempotency-Key"]).toBeUndefined();
  });

  it("maps member writes to their routes and bodies", async () => {
    const fetchFn = mockFetch({ data: evidence });
    const ctx = authed(fetchFn);
    await tool("builder_withdraw_evidence").handler({ evidence_id: "ev_1" }, ctx);
    await tool("builder_update_evidence").handler({ evidence_id: "ev_1", changes: { title: "Six interviews" } }, ctx);
    await tool("builder_appeal_evidence").handler({ evidence_id: "ev_1", reason: "The links show all five interview notes." }, ctx);
    await tool("builder_create_project").handler({ name: "Side project", stage: "build" }, ctx);
    await tool("builder_join_season").handler({ track: "ship", goal: "Launch" }, ctx);
    await tool("builder_save_time_capsule").handler({ kind: "intent", body: "Ship weekly" }, ctx);
    await tool("builder_request_year_video").handler({ year: 2026, format: "9x16" }, ctx);
    await tool("builder_revoke_share_link").handler({ year: 2026, link_id: "l1" }, ctx);
    const calls = fetchFn.mock.calls.map((_, i) => call(fetchFn, i));
    expect(calls.map((c) => `${c.init.method} ${c.url.pathname}`)).toEqual([
      "PATCH /api/v1/builder-evidence/ev_1",
      "PATCH /api/v1/builder-evidence/ev_1",
      "POST /api/v1/builder-evidence/ev_1/appeal",
      "POST /api/v1/builder-projects",
      "POST /api/v1/builder-seasons",
      "POST /api/v1/builder-time-capsule",
      "POST /api/v1/builder-year/2026/render",
      "DELETE /api/v1/builder-year/2026/share/l1"
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      { action: "withdraw" },
      { title: "Six interviews" },
      { reason: "The links show all five interview notes." },
      { name: "Side project", stage: "build" },
      { track: "ship", goal: "Launch" },
      { kind: "intent", body: "Ship weekly" },
      { format: "9x16" },
      undefined
    ]);
    for (const c of calls) expect(c.headers["Idempotency-Key"]).toMatch(UUID_RE);
  });

  it("validates arguments before fetching", async () => {
    const fetchFn = mockFetch({ data: {} });
    const ctx = authed(fetchFn);
    await failure(tool("builder_update_evidence").handler({ evidence_id: "ev_1", changes: {} }, ctx));
    await failure(tool("builder_appeal_evidence").handler({ evidence_id: "ev_1", reason: "too short" }, ctx));
    await failure(tool("builder_get_year").handler({ year: "2026" }, ctx));
    await failure(tool("builder_list_evidence").handler({ limit: 500 }, ctx));
    await failure(tool("builder_get_me").handler({ api_key: 42 }, ctx));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("forces a dry run for the admin backfill preview and sends the admin session cookie", async () => {
    const fetchFn = mockFetch({ data: { dryRun: true, totals: { planned: 2 } } });
    await tool("builder_admin_backfill_preview").handler({ userIds: ["u1"], session_cookie: "better-auth.session_token=abc" }, authed(fetchFn));
    const c = call(fetchFn);
    expect(c.body).toEqual({ userIds: ["u1"], dryRun: true });
    expect(c.headers.Cookie).toBe("better-auth.session_token=abc");
    expect(c.headers.Authorization).toBeUndefined();
    await failure(tool("builder_admin_backfill_preview").handler({ dryRun: false }, authed(fetchFn)));

    const queueFetch = mockFetch({ data: [], pagination: { nextCursor: null, limit: 20 } });
    await tool("builder_admin_list_queue").handler({ view: "appeals", session_cookie: "c=1" }, authed(queueFetch));
    expect(`${call(queueFetch).url.pathname}${call(queueFetch).url.search}`).toBe("/api/v1/builder-admin/queue?view=appeals");
  });

  it("uses the OAuth delegated fetch without forwarding keys or cookies", async () => {
    vi.stubEnv("NLB_SESSION_COOKIE", "should-not-leak");
    const fetchFn = mockFetch({ data: { showNav: true } });
    const ctx: ToolContext = { env: { NLB_API_URL: API }, oauth: { subject: "u1", scopes: ["mcp:read"] }, fetch: fetchFn as unknown as typeof fetch };
    await tool("builder_get_me").handler({}, ctx);
    await tool("builder_admin_list_queue").handler({}, ctx);
    for (const i of [0, 1]) {
      const c = call(fetchFn, i);
      expect(c.headers.Authorization).toBeUndefined();
      expect(c.headers.Cookie).toBeUndefined();
    }
  });

  it("refuses anonymous Worker callers and never lends them the server key", async () => {
    const fetchFn = mockFetch({ data: {} });
    const anonymous: ToolContext = { workerAuth: false, env: ENV, fetch: fetchFn as unknown as typeof fetch };
    for (const name of ["builder_get_me", "builder_submit_evidence"]) {
      const err = await failure(tool(name).handler({ eventType: "x", title: "abc", occurredAt: "2026-11-02" }, anonymous));
      expect(err.data.status).toBe(401);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("Builder League MCP tools: failures", () => {
  const notFound = { error: { code: "not_found", message: "Not found" } };

  it("explains a hidden league (flag off) and keeps the status", async () => {
    const err = await failure(tool("builder_get_me").handler({}, authed(mockFetch(notFound, 404))));
    expect(err.message).toContain("Builder League is not enabled on this environment");
    expect(err.data).toMatchObject({ status: 404, code: "not_found", notEnabled: true });
  });

  it("keeps a 404 on one item ambiguous instead of claiming the flag is off", async () => {
    const err = await failure(tool("builder_get_evidence").handler({ evidence_id: "missing" }, authed(mockFetch(notFound, 404))));
    expect(err.message).toContain("Not found, or Builder League is not enabled on this environment");
    expect(err.data).toMatchObject({ status: 404, notEnabled: false });
  });

  it("surfaces membership, session-only and validation errors with structured data", async () => {
    const membership = await failure(tool("builder_get_me").handler({}, authed(mockFetch({ error: { code: "membership_required", message: "Builder League membership required" } }, 403))));
    expect(membership.message).toContain("membership required");
    expect(membership.data).toMatchObject({ status: 403, code: "membership_required", notEnabled: false });

    const session = await failure(tool("builder_admin_list_queue").handler({}, authed(mockFetch({ error: { code: "session_required", message: "Admin actions require a signed-in session." } }, 403))));
    expect(session.message).toContain("API keys and MCP agents are refused");

    const details = [{ path: "occurredAt", message: "occurredAt cannot be in the future." }];
    const invalid = await failure(tool("builder_submit_evidence").handler(
      { eventType: "build_mvp", title: "MVP live", occurredAt: "2030-01-01" },
      authed(mockFetch({ error: { code: "validation_failed", message: "Bad request", details } }, 400))
    ));
    expect(invalid.data).toMatchObject({ status: 400, code: "validation_failed", details });
    expect(invalid.message).toContain("occurredAt: occurredAt cannot be in the future.");
  });

  it("adds a credential hint on 401 and does not crash on non-JSON bodies", async () => {
    const fetchFn = vi.fn(async () => new Response("upstream down", { status: 502 }));
    const err = await failure(tool("builder_get_seasons").handler({}, { workerAuth: true, env: ENV, fetch: fetchFn as unknown as typeof fetch }));
    expect(err.data).toMatchObject({ status: 502 });
    expect(err.message).toContain("upstream down");

    const unauth = await failure(tool("builder_get_seasons").handler({}, authed(mockFetch({ error: { code: "unauthorized", message: "Sign in required" } }, 401))));
    expect(unauth.data.hint).toMatch(/API key/);
  });

  it("rejects a response that does not match the contract", async () => {
    await expect(tool("builder_get_evidence").handler({ evidence_id: "ev_1" }, authed(mockFetch({ data: { id: 1 } })))).rejects.toThrow(/schema mismatch/);
  });
});

describe("blog tools kept in sync with /api/v1/blog", () => {
  it("blog_get_revision reads one revision as a private read", async () => {
    const revision = { id: "rev_9", postId: "post_1", version: 2, note: null, actorId: "u1", createdAt: "2026-10-13T00:00:00.000Z" };
    const fetchFn = mockFetch({ data: revision });
    expect(await tool("blog_get_revision").handler({ post_id: "post_1", revision_id: "rev_9" }, authed(fetchFn))).toEqual({ data: revision });
    const c = call(fetchFn);
    expect(c.init.method).toBe("GET");
    expect(c.url.pathname).toBe("/api/v1/blog/posts/post_1/revisions/rev_9");
    expect(requiredToolScope("blog_get_revision")).toBe("mcp:read");
    expect(isPrivateReadTool("blog_get_revision")).toBe(true);
  });

  it("blog_list_posts caps limit and offset like the web route", async () => {
    const fetchFn = mockFetch({ data: [], pagination: { limit: 100, offset: 0, count: 0 } });
    await expect(tool("blog_list_posts").handler({ limit: 101 }, authed(fetchFn))).rejects.toThrow();
    await expect(tool("blog_list_posts").handler({ offset: 100001 }, authed(fetchFn))).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
