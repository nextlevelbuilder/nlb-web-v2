import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingStatusResponseSchema } from "@nextlevelbuilder/contracts";
import { PRODUCT_IDS } from "@/lib/polar";
import { openApiSpec } from "@/lib/openapi";
import { createMember, createTestUser, type TestUser } from "./helpers/onboarding-fixtures";

const resolveCallerMock = vi.fn();
const checkoutGetMock = vi.fn();

vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: (...args: unknown[]) => resolveCallerMock(...args) }));
vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    checkouts = { get: (...args: unknown[]) => checkoutGetMock(...args), create: vi.fn() };
    subscriptions = { get: vi.fn() };
  },
}));

async function getStatus(query = "", headers: Record<string, string> = { authorization: "Bearer nlb_live_test" }) {
  const { GET } = await import("@/app/api/v1/onboarding-status/route");
  return GET(new Request(`https://nextlevelbuilder.io/api/v1/onboarding-status${query}`, { headers }));
}

const callerFor = (user: TestUser, authType: "api_key" | "delegation" | "session" = "api_key") => ({
  user: { id: user.id, email: user.email, emailVerified: user.emailVerified, role: user.role, name: user.id },
  authType,
});

let user: TestUser;

beforeEach(async () => {
  vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
  resolveCallerMock.mockReset();
  checkoutGetMock.mockReset();
  user = await createTestUser();
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/v1/onboarding-status", () => {
  it("is not found while onboarding is off, before resolving the caller", async () => {
    vi.stubEnv("ONBOARDING_V2_ENABLED", "false");
    const response = await getStatus();
    expect(response.status).toBe(404);
    expect((await response.json()).error).toEqual({ code: "not_found", message: "Onboarding is not enabled on this environment." });
    expect(resolveCallerMock).not.toHaveBeenCalled();
  });

  it("requires an identity", async () => {
    resolveCallerMock.mockResolvedValue(null);
    const response = await getStatus("", {});
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
  });

  it("returns the API-key caller's status in a data envelope that matches the shared contract", async () => {
    await createMember(user, { productId: PRODUCT_IDS.VIP_ANNUAL });
    resolveCallerMock.mockResolvedValue(callerFor(user));
    const response = await getStatus();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = OnboardingStatusResponseSchema.parse(await response.json());
    expect(body.data.membership).toMatchObject({ tier: "vip", term: "annual", status: "active" });
    expect(body.data.connections.discord.nextAction).toBe("connect");
  });

  it("resolves MCP delegation as an mcp:read call on this path", async () => {
    resolveCallerMock.mockResolvedValue(callerFor(user, "delegation"));
    const response = await getStatus();
    expect(response.status).toBe(200);
    expect(resolveCallerMock).toHaveBeenCalledWith(expect.any(Headers), expect.anything(), {
      scope: "mcp:read",
      method: "GET",
      path: "/api/v1/onboarding-status",
    });
    expect((await response.json()).data.payment).toBe("none");
  });

  it("never verifies a Polar checkout, even when one is named in the query", async () => {
    resolveCallerMock.mockResolvedValue(callerFor(user));
    const response = await getStatus("?checkout_id=chk_1");
    expect(response.status).toBe(200);
    expect(checkoutGetMock).not.toHaveBeenCalled();
  });

  it("is documented in the OpenAPI spec as a read-only operation", () => {
    const path = (openApiSpec.paths as Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown> }>>)["/api/v1/onboarding-status"];
    expect(Object.keys(path)).toEqual(["get"]);
    expect(path.get.operationId).toBe("getOnboardingStatus");
    expect(Object.keys(path.get.responses ?? {})).toEqual(expect.arrayContaining(["200", "401", "404"]));
  });
});
