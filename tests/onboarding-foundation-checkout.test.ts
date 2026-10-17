import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { PRODUCT_IDS } from "@/lib/polar";

const createCheckoutMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    checkouts = { create: (...args: unknown[]) => createCheckoutMock(...args) };
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

async function checkout(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/checkout/route");
  const response = await POST(
    new Request("https://nextlevelbuilder.io/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
  expect(response.status).toBe(200);
  return createCheckoutMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  createCheckoutMock.mockReset().mockResolvedValue({ id: "chk_1", url: "https://polar.test/checkout/chk_1" });
  getSessionMock.mockReset().mockResolvedValue({ user: { id: "nlb-user-1" } });
});

afterEach(() => vi.unstubAllEnvs());

describe("checkout with onboarding v2 off", () => {
  it("keeps today's success URL and adds no user binding", async () => {
    const request = await checkout({ productId: PRODUCT_IDS.PREMIUM_ANNUAL });
    expect(request.successUrl).toBe(`${env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_ID}`);
    expect(request).not.toHaveProperty("externalCustomerId");
    expect(request.metadata).not.toHaveProperty("nlb_user_id");
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

describe("checkout with onboarding v2 on", () => {
  beforeEach(() => vi.stubEnv("ONBOARDING_V2_ENABLED", "true"));

  it("sends memberships to the onboarding page and binds the signed-in user server-side", async () => {
    const request = await checkout({ productId: PRODUCT_IDS.VIP_QUARTERLY });
    expect(request.successUrl).toBe(`${env.NEXT_PUBLIC_APP_URL}/onboarding?checkout_id={CHECKOUT_ID}`);
    expect(request.externalCustomerId).toBe("nlb-user-1");
    expect(request.metadata).toMatchObject({ nlb_user_id: "nlb-user-1", nlb_locale: "en" });
  });

  it("uses the Vietnamese onboarding path from the body or the referring page", async () => {
    expect((await checkout({ productId: PRODUCT_IDS.PREMIUM_QUARTERLY, locale: "vi" })).successUrl).toBe(
      `${env.NEXT_PUBLIC_APP_URL}/vi/onboarding?checkout_id={CHECKOUT_ID}`
    );
    const fromReferer = await checkout({ productId: PRODUCT_IDS.PREMIUM_QUARTERLY }, { referer: "https://nextlevelbuilder.io/vi/pricing" });
    expect(fromReferer.successUrl).toBe(`${env.NEXT_PUBLIC_APP_URL}/vi/onboarding?checkout_id={CHECKOUT_ID}`);
    expect(fromReferer.metadata.nlb_locale).toBe("vi");
  });

  it("never trusts a user id from the body and omits the binding for anonymous buyers", async () => {
    getSessionMock.mockResolvedValue(null);
    const request = await checkout({ productId: PRODUCT_IDS.PREMIUM_ANNUAL, nlbUserId: "attacker", nlb_user_id: "attacker" });
    expect(request).not.toHaveProperty("externalCustomerId");
    expect(request.metadata).not.toHaveProperty("nlb_user_id");
  });

  it("leaves toolkit checkouts unchanged", async () => {
    const request = await checkout({ productId: PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD });
    expect(request.successUrl).toBe(`${env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_ID}`);
    expect(request).not.toHaveProperty("externalCustomerId");
  });
});
