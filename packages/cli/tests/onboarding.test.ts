import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../src/cli.js";
import { NlbOnboardingClient } from "../src/api/onboarding-client.js";

const BASE = "https://staging.nextlevelbuilder.io";
const KEY = "nlb_live_onboardingtest";
const status = {
  payment: "verified",
  membership: { tier: "vip", plan: "VIP", term: "annual", status: "active", renewsAt: "2027-10-01T00:00:00.000Z", cancelAtPeriodEnd: false },
  profile: { goal: "Ship", profileLinks: [], skills: "", phone: "", commitmentAccepted: true, completed: true },
  connections: { discord: { status: "active", nextAction: "none", displayName: "me" }, telegram: { status: "not_connected", nextAction: "connect" } }
};

function mockFetch(body: unknown, code = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status: code }));
}

async function run(args: string[], fetchFn: ReturnType<typeof mockFetch>) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await createProgram({ onboarding: { fetchFn: fetchFn as unknown as typeof fetch } }).parseAsync(["node", "nlb", "onboarding", "status", ...args, "--api-key", KEY, "--url", BASE]);
  return { log, err, json: () => JSON.parse(String(log.mock.calls[0]?.[0])) };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("nlb onboarding status", () => {
  it("reads the v1 status route with the API key", async () => {
    const fetchFn = mockFetch({ data: status });
    const { json } = await run(["--json"], fetchFn);
    expect(json()).toEqual({ data: status });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/v1/onboarding-status`);
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
  });

  it("renders a readable summary", async () => {
    const { log } = await run([], mockFetch({ data: status }));
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("payment:    verified");
    expect(out).toContain("next: connect");
  });

  it("explains a disabled feature with exit code 1", async () => {
    const { json } = await run(["--json"], mockFetch({ error: { code: "not_found", message: "Onboarding is not enabled on this environment." } }, 404));
    expect(json()).toMatchObject({ success: false, status: 404, notEnabled: true, code: "not_found" });
    expect(json().error).toContain("not enabled on this environment");
    expect(process.exitCode).toBe(1);
  });

  it("requires an API key and rejects malformed responses", async () => {
    const fetchFn = mockFetch({ data: status });
    await expect(new NlbOnboardingClient({ baseUrl: BASE, fetchFn: fetchFn as unknown as typeof fetch }).getStatus()).rejects.toThrow(/API key is required/);
    expect(fetchFn).not.toHaveBeenCalled();
    const bad = new NlbOnboardingClient({ baseUrl: BASE, apiKey: KEY, fetchFn: mockFetch({ data: { payment: "paid" } }) as unknown as typeof fetch });
    await expect(bad.getStatus()).rejects.toThrow(/schema mismatch/);
  });
});
