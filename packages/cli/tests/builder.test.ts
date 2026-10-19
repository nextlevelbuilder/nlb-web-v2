import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILDER_LEAGUE_NOT_ENABLED_MESSAGE } from "@nextlevelbuilder/contracts";
import { createProgram } from "../src/cli.js";
import { BuilderApiError, BuilderInputError, NlbBuilderClient } from "../src/api/builder-client.js";

const BASE = "https://staging.nextlevelbuilder.io";
const KEY = "nlb_live_buildertest";
const COOKIE = "__Secure-better-auth.session_token=abc";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const evidence = {
  id: "ev_1", userId: "u_1", projectId: null, eventType: "customer_interview", stage: "validate", title: "Talked to five users",
  summary: "", occurredAt: "2026-10-18T00:00:00.000Z", links: [], files: [], counterpartyUserId: null, counterpartyConfirmedAt: null,
  status: "submitted", source: "api", visibility: "private", decision: null, eventId: null, appeal: null,
  createdAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:00.000Z"
};
const submission = { eventType: "customer_interview", title: "Talked to five users", occurredAt: "2026-10-18" };

type FetchCall = [string, RequestInit];

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }));
}

function call(fetchFn: ReturnType<typeof mockFetch>, index = 0) {
  const [url, init] = fetchFn.mock.calls[index] as unknown as FetchCall;
  return { url: new URL(url), init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

function tmpJson(value: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), "nlb-builder-")), "input.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

async function run(args: string[], fetchFn: ReturnType<typeof mockFetch>, credentials: string[] = ["--api-key", KEY]) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await createProgram({ builder: { fetchFn: fetchFn as unknown as typeof fetch } }).parseAsync(["node", "nlb", "builder", ...args, ...credentials, "--url", BASE]);
  return { log, err, json: () => JSON.parse(String(log.mock.calls[0]?.[0])) };
}

beforeEach(() => {
  vi.stubEnv("NLB_SESSION_COOKIE", "");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = 0;
});

describe("nlb builder evidence", () => {
  it("submits self-reported evidence with the key and the client key as Idempotency-Key", async () => {
    const fetchFn = mockFetch({ data: evidence }, 201);
    const { json } = await run(["evidence", "submit", tmpJson(submission), "--client-key", "run-42", "--json"], fetchFn);
    expect(json().data).toMatchObject({ status: "submitted", source: "api", eventId: null });
    const c = call(fetchFn);
    expect(c.init.method).toBe("POST");
    expect(c.url.pathname).toBe("/api/v1/builder-evidence");
    expect(c.body).toEqual({ ...submission, clientKey: "run-42" });
    expect(c.headers).toMatchObject({ Authorization: `Bearer ${KEY}`, "Idempotency-Key": "run-42" });
    expect(c.headers.Cookie).toBeUndefined();
  });

  it.each([{ verification: "moderator_verified" }, { status: "approved" }, { source: "moderator" }, { points: 50 }])(
    "rejects a forged ledger field %o before any request",
    async (forged) => {
      const fetchFn = mockFetch({ data: evidence });
      const { json } = await run(["evidence", "submit", tmpJson({ ...submission, ...forged }), "--json"], fetchFn);
      expect(json()).toMatchObject({ success: false });
      expect(json().error).toMatch(/Invalid evidence/);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  it("lists evidence with typed query parameters and shows the next cursor", async () => {
    const fetchFn = mockFetch({ data: [evidence], pagination: { nextCursor: "c2", limit: 5 } });
    const { log } = await run(["evidence", "list", "--status", "submitted", "--limit", "5"], fetchFn);
    const c = call(fetchFn);
    expect(c.url.pathname).toBe("/api/v1/builder-evidence");
    expect(Object.fromEntries(c.url.searchParams)).toEqual({ status: "submitted", limit: "5" });
    expect(log.mock.calls.flat().join("\n")).toContain("--cursor c2");
  });

  it("withdraws and appeals through the evidence routes", async () => {
    const fetchFn = mockFetch({ data: evidence });
    await run(["evidence", "withdraw", "ev_1", "--json"], fetchFn);
    expect(call(fetchFn).init.method).toBe("PATCH");
    expect(call(fetchFn).body).toEqual({ action: "withdraw" });

    const appealFetch = mockFetch({ data: { id: "ap_1" } }, 201);
    await run(["evidence", "appeal", "ev_1", "--reason", "The interview notes were attached later.", "--json"], appealFetch);
    expect(call(appealFetch).url.pathname).toBe("/api/v1/builder-evidence/ev_1/appeal");
    expect(call(appealFetch).body).toEqual({ reason: "The interview notes were attached later." });
  });
});

describe("nlb builder flag off and errors", () => {
  it("explains that Builder League is not enabled and keeps the status", async () => {
    const fetchFn = mockFetch({ error: { code: "not_found", message: "Not found." } }, 404);
    const { json } = await run(["me", "--json"], fetchFn);
    expect(json()).toMatchObject({ success: false, status: 404, notEnabled: true, code: "not_found" });
    expect(json().error).toContain(BUILDER_LEAGUE_NOT_ENABLED_MESSAGE);
    expect(process.exitCode).toBe(1);
  });

  it("prints the not-enabled message in human mode without crashing", async () => {
    const fetchFn = mockFetch({ error: { code: "not_found", message: "Not found." } }, 404);
    const { err } = await run(["rankings"], fetchFn);
    expect(err.mock.calls.flat().join("\n")).toContain("Builder League is not enabled on this environment");
    expect(process.exitCode).toBe(1);
  });

  it("does not claim the feature is off when one item is missing", async () => {
    const fetchFn = mockFetch({ error: { code: "not_found", message: "Not found." } }, 404);
    const { json } = await run(["evidence", "get", "ev_missing", "--json"], fetchFn);
    expect(json()).toMatchObject({ status: 404, notEnabled: false });
    expect(json().error).toContain("Not found, or Builder League is not enabled");
  });

  it("reports membership_required as a 403", async () => {
    const fetchFn = mockFetch({ error: { code: "membership_required", message: "Members only." } }, 403);
    const { json } = await run(["journey", "--json"], fetchFn);
    expect(json()).toMatchObject({ status: 403, code: "membership_required", notEnabled: false });
  });

  it("rejects an out-of-range year before any request", async () => {
    const fetchFn = mockFetch({ data: {} });
    const { json } = await run(["year", "get", "1999", "--json"], fetchFn);
    expect(json().error).toMatch(/Invalid year/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("nlb builder session-only and admin commands", () => {
  it("refuses session-only actions without a cookie before any request", async () => {
    const fetchFn = mockFetch({ data: {} });
    const { json } = await run(["rewards", "claim", "rw_1", "--json"], fetchFn);
    expect(json().error).toMatch(/signed-in session/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends only the cookie for session-only actions even when a key is set", async () => {
    const fetchFn = mockFetch({ data: { ok: true } });
    await run(["evidence", "confirm", "ev_1", "--json"], fetchFn, ["--api-key", KEY, "--cookie", COOKIE]);
    const c = call(fetchFn);
    expect(c.url.pathname).toBe("/api/v1/builder-evidence/ev_1/confirm");
    expect(c.headers.Cookie).toBe(COOKIE);
    expect(c.headers.Authorization).toBeUndefined();
  });

  it("keeps member writes on the API key when NLB_SESSION_COOKIE is also set", async () => {
    vi.stubEnv("NLB_SESSION_COOKIE", COOKIE);
    const fetchFn = mockFetch({ data: evidence }, 201);
    await run(["evidence", "submit", tmpJson(submission), "--json"], fetchFn);
    const c = call(fetchFn);
    expect(c.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(c.headers.Cookie).toBeUndefined();
    expect(c.headers["Idempotency-Key"]).toMatch(UUID_RE);
  });

  it("previews the backfill by default and applies it only with --apply", async () => {
    const fetchFn = mockFetch({ data: { dryRun: true } });
    await run(["admin", "backfill", "--user", "u_1", "--user", "u_2", "--json"], fetchFn, ["--cookie", COOKIE]);
    expect(call(fetchFn).body).toEqual({ userIds: ["u_1", "u_2"], dryRun: true });

    const applyFetch = mockFetch({ data: { dryRun: false } });
    await run(["admin", "backfill", "--apply", "--json"], applyFetch, ["--cookie", COOKIE]);
    expect(call(applyFetch).body).toEqual({ dryRun: false });
  });

  it("records an admin decision with repeatable reason codes", async () => {
    const fetchFn = mockFetch({ data: evidence });
    await run(["admin", "decide", "ev_1", "--decision", "reject", "--reason-code", "duplicate", "--reason-code", "other", "--note", "Same as ev_0", "--json"], fetchFn, ["--cookie", COOKIE]);
    const c = call(fetchFn);
    expect(c.url.pathname).toBe("/api/v1/builder-admin/evidence/ev_1/decision");
    expect(c.body).toEqual({ decision: "reject", reasonCodes: ["duplicate", "other"], note: "Same as ev_0" });
  });

  it("surfaces the server's session_required refusal", async () => {
    const fetchFn = mockFetch({ error: { code: "session_required", message: "Sign in on the website." } }, 403);
    const { json } = await run(["admin", "queue", "--json"], fetchFn, ["--cookie", COOKIE]);
    expect(json()).toMatchObject({ status: 403, code: "session_required" });
    expect(json().error).toContain("API keys and MCP agents are refused");
  });

  it("sets hidden Year in Review scenes, and an empty list clears them", async () => {
    const fetchFn = mockFetch({ data: { hiddenScenes: [] } });
    await run(["year", "hide", "2026", "first_idea", "launch", "--json"], fetchFn, ["--cookie", COOKIE]);
    expect(call(fetchFn).url.pathname).toBe("/api/v1/builder-year/2026");
    expect(call(fetchFn).body).toEqual({ hiddenScenes: ["first_idea", "launch"] });
    const clearFetch = mockFetch({ data: { hiddenScenes: [] } });
    await run(["year", "hide", "2026", "--json"], clearFetch, ["--cookie", COOKIE]);
    expect(call(clearFetch).body).toEqual({ hiddenScenes: [] });
  });
});

describe("NlbBuilderClient", () => {
  it("never sends the session cookie to a foreign origin", async () => {
    const fetchFn = mockFetch({ data: {} });
    const client = new NlbBuilderClient({ baseUrl: "https://evil.example", sessionCookie: COOKIE, fetchFn: fetchFn as unknown as typeof fetch });
    await expect(client.getMe()).rejects.toThrow(/Refusing to send the session cookie/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("builds read routes and validates inputs locally", async () => {
    const fetchFn = mockFetch({ data: {} });
    const client = new NlbBuilderClient({ baseUrl: `${BASE}/`, apiKey: KEY, fetchFn: fetchFn as unknown as typeof fetch });
    await client.listMissions("vi");
    expect(call(fetchFn).url.toString()).toBe(`${BASE}/api/v1/builder-missions?locale=vi`);
    await client.getPassport("user/1");
    expect(call(fetchFn, 1).url.pathname).toBe("/api/v1/builder-passport/user%2F1");
    await expect(client.listBadges("fr")).rejects.toBeInstanceOf(BuilderInputError);
    await expect(client.requestYearVideo(2026, "4x3")).rejects.toBeInstanceOf(BuilderInputError);
  });

  it("raises BuilderApiError for a non-JSON gateway failure", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    const client = new NlbBuilderClient({ baseUrl: BASE, apiKey: KEY, fetchFn: fetchFn as unknown as typeof fetch });
    const err = await client.getSeasons().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BuilderApiError);
    expect((err as BuilderApiError).status).toBe(502);
  });

  it("rejects a response that is not a Builder envelope", async () => {
    const client = new NlbBuilderClient({ baseUrl: BASE, apiKey: KEY, fetchFn: mockFetch({ ok: true }) as unknown as typeof fetch });
    await expect(client.getAccess()).rejects.toThrow(/schema mismatch/);
  });
});
