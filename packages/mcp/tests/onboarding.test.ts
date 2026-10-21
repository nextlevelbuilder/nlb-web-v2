import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOLS } from "../src/tools/index.js";
import { ToolError, isPrivateReadTool, requiredToolScope, type ToolContext } from "../src/tool-context.js";

const API = "https://staging.nextlevelbuilder.io";
const status = {
  payment: "verified",
  membership: { tier: "vip", plan: "VIP", term: "annual", status: "active", renewsAt: "2027-10-01T00:00:00.000Z", cancelAtPeriodEnd: false },
  profile: { goal: "Ship", profileLinks: [], skills: "", phone: "", commitmentAccepted: true, completed: true },
  connections: { discord: { status: "active", nextAction: "none", displayName: "me" }, telegram: { status: "not_connected", nextAction: "connect" } }
};

const onboarding = () => TOOLS.find((t) => t.name === "onboarding_get_status")!;
const mockFetch = (body: unknown, code = 200) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status: code }));
const ctx = (fetchFn: ReturnType<typeof mockFetch>): ToolContext => ({ workerAuth: true, env: { NLB_API_KEY: "nlb_live_k", NLB_API_URL: API }, fetch: fetchFn as unknown as typeof fetch });

afterEach(() => vi.restoreAllMocks());

describe("onboarding_get_status", () => {
  it("is a private mcp:read tool", () => {
    expect(onboarding()).toBeDefined();
    expect(requiredToolScope("onboarding_get_status")).toBe("mcp:read");
    expect(isPrivateReadTool("onboarding_get_status")).toBe(true);
  });

  it("reads the v1 status route with the member key", async () => {
    const fetchFn = mockFetch({ data: status });
    expect(await onboarding().handler({}, ctx(fetchFn))).toEqual({ data: status });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/api/v1/onboarding-status`);
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ Authorization: "Bearer nlb_live_k" });
  });

  it("explains a disabled feature and keeps the status", async () => {
    const err = await onboarding().handler({}, ctx(mockFetch({ error: { code: "not_found", message: "Onboarding is not enabled on this environment." } }, 404))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).message).toContain("not enabled on this environment");
    expect((err as ToolError).data).toMatchObject({ status: 404, code: "not_found", notEnabled: true });
  });

  it("refuses anonymous Worker callers before fetching", async () => {
    const fetchFn = mockFetch({ data: status });
    const err = await onboarding().handler({}, { workerAuth: false, fetch: fetchFn as unknown as typeof fetch }).catch((e: unknown) => e);
    expect((err as ToolError).data).toMatchObject({ status: 401 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects a malformed response", async () => {
    await expect(onboarding().handler({}, ctx(mockFetch({ data: { payment: "paid" } })))).rejects.toThrow(/schema mismatch/);
  });
});
