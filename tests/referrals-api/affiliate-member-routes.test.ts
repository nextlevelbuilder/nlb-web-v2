import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);

import { getDb } from "@/lib/db";
import { affiliateLinks } from "@/lib/db/schema";
import { AFFILIATE_TERMS_VERSION } from "@/lib/referrals/program-rules";
import { GET as getProgram } from "@/app/api/v1/affiliates/program/route";
import { GET as getMe, POST as enroll } from "@/app/api/v1/affiliates/me/route";
import { GET as preview } from "@/app/api/v1/affiliates/preview/route";
import { GET as listLinks, POST as createLink } from "@/app/api/v1/affiliates/links/route";
import { PATCH as updateLink } from "@/app/api/v1/affiliates/links/[id]/route";
import { GET as listConversions } from "@/app/api/v1/affiliates/conversions/route";
import { GET as getCommissions } from "@/app/api/v1/affiliates/commissions/route";
import { GET as listPayouts } from "@/app/api/v1/affiliates/payouts/route";
import { GET as getPayoutMethod, PUT as putPayoutMethod } from "@/app/api/v1/affiliates/payout-method/route";
import {
  TEST_ENCRYPTION_KEY,
  asCaller,
  getRequest,
  jsonRequest,
  params,
  readJson,
  seedReferredSale,
  seedUser,
  setCaller,
  type SeededUser,
} from "./referral-api-fixtures";

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  setCaller(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function enrolledMember(prefix = "member"): Promise<SeededUser> {
  const user = await seedUser(prefix);
  setCaller(asCaller(user, "session"));
  const response = await enroll(jsonRequest("/api/v1/affiliates/me", "POST", { termsVersion: AFFILIATE_TERMS_VERSION }));
  expect(response.status).toBe(201);
  return user;
}

describe("feature flag and authentication", () => {
  it("answers 404 not_found on every member route while AFFILIATES_ENABLED is off", async () => {
    const user = await seedUser("flagoff");
    setCaller(asCaller(user, "session"));
    vi.stubEnv("AFFILIATES_ENABLED", "false");
    const responses = await Promise.all([
      getProgram(),
      getMe(getRequest("/api/v1/affiliates/me")),
      enroll(jsonRequest("/api/v1/affiliates/me", "POST", { termsVersion: AFFILIATE_TERMS_VERSION })),
      preview(getRequest("/api/v1/affiliates/preview?discountBps=0")),
      listLinks(getRequest("/api/v1/affiliates/links")),
      createLink(jsonRequest("/api/v1/affiliates/links", "POST", {})),
      updateLink(jsonRequest("/api/v1/affiliates/links/x", "PATCH", {}), params({ id: "x" })),
      listConversions(getRequest("/api/v1/affiliates/conversions")),
      getCommissions(getRequest("/api/v1/affiliates/commissions")),
      listPayouts(getRequest("/api/v1/affiliates/payouts")),
      getPayoutMethod(getRequest("/api/v1/affiliates/payout-method")),
      putPayoutMethod(jsonRequest("/api/v1/affiliates/payout-method", "PUT", {})),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect((await readJson(response)).error?.code).toBe("not_found");
    }
  });

  it("serves the program publicly and refuses anonymous member calls with 401", async () => {
    const program = await getProgram();
    expect(program.status).toBe(200);
    expect((await readJson(program)).data).toMatchObject({ rulesVersion: 0, termsVersion: AFFILIATE_TERMS_VERSION });

    for (const response of [
      await getMe(getRequest("/api/v1/affiliates/me")),
      await createLink(jsonRequest("/api/v1/affiliates/links", "POST", {})),
      await getPayoutMethod(getRequest("/api/v1/affiliates/payout-method")),
    ]) {
      expect(response.status).toBe(401);
      expect((await readJson(response)).error?.code).toBe("unauthenticated");
    }
  });

  it("binds MCP delegations to mcp:read for reads and mcp:write for writes", async () => {
    const user = await enrolledMember();
    setCaller(asCaller(user, "delegation"), "mcp:read");
    expect((await listLinks(getRequest("/api/v1/affiliates/links"))).status).toBe(200);
    expect((await createLink(jsonRequest("/api/v1/affiliates/links", "POST", {}))).status).toBe(401);
    setCaller(asCaller(user, "delegation"), "mcp:write");
    expect((await createLink(jsonRequest("/api/v1/affiliates/links", "POST", {}))).status).toBe(201);
  });

  it("refuses cross-site session writes", async () => {
    const user = await enrolledMember();
    setCaller(asCaller(user, "session"));
    const response = await createLink(jsonRequest("/api/v1/affiliates/links", "POST", {}, { origin: "https://evil.test" }));
    expect(response.status).toBe(403);
    expect((await readJson(response)).error?.code).toBe("cross_site_request");
  });
});

describe("enrolment", () => {
  it("enrols once with the current terms and reports not_enrolled before", async () => {
    const user = await seedUser("enrol");
    setCaller(asCaller(user, "api_key"));
    const before = await getMe(getRequest("/api/v1/affiliates/me"));
    expect(before.status).toBe(404);
    expect((await readJson(before)).error?.code).toBe("not_enrolled");

    const stale = await enroll(jsonRequest("/api/v1/affiliates/me", "POST", { termsVersion: "2000-01-01" }));
    expect(stale.status).toBe(422);
    expect((await readJson(stale)).error?.code).toBe("terms_not_accepted");

    const joined = await enroll(jsonRequest("/api/v1/affiliates/me", "POST", { termsVersion: AFFILIATE_TERMS_VERSION }));
    expect(joined.status).toBe(201);
    expect((await readJson(joined)).data).toMatchObject({ status: "active", level: "starter", budgetBps: 1000, payoutMethod: null });
    const again = await enroll(jsonRequest("/api/v1/affiliates/me", "POST", { termsVersion: AFFILIATE_TERMS_VERSION }));
    expect(again.status).toBe(409);
    expect((await readJson(again)).error?.code).toBe("already_enrolled");
    expect((await getMe(getRequest("/api/v1/affiliates/me"))).status).toBe(200);
  });

  it("refuses unknown body keys", async () => {
    const user = await seedUser("enrol");
    setCaller(asCaller(user, "session"));
    const response = await enroll(jsonRequest("/api/v1/affiliates/me", "POST", { termsVersion: AFFILIATE_TERMS_VERSION, status: "active" }));
    expect(response.status).toBe(400);
    expect((await readJson(response)).error?.code).toBe("validation_failed");
  });
});

describe("links", () => {
  it("creates links inside the budget and refuses an over-budget discount with 422", async () => {
    await enrolledMember();
    const created = await createLink(jsonRequest("/api/v1/affiliates/links", "POST", { label: "Newsletter", discountBps: 500, utmCampaign: "news" }));
    expect(created.status).toBe(201);
    const link = (await readJson(created)).data;
    expect(link).toMatchObject({ label: "Newsletter", discountBps: 500, commissionBps: 526, status: "active", version: 1 });
    expect(link.url).toMatch(new RegExp(`/r/${link.code}$`));

    const over = await createLink(jsonRequest("/api/v1/affiliates/links", "POST", { discountBps: 2000 }));
    expect(over.status).toBe(422);
    expect((await readJson(over)).error?.code).toBe("over_budget");

    const listed = (await readJson(await listLinks(getRequest("/api/v1/affiliates/links")))).data;
    expect(listed.links.map((entry: { id: string }) => entry.id)).toEqual([link.id]);
  });

  it("replays a create with the same Idempotency-Key instead of creating a second link", async () => {
    const user = await enrolledMember();
    const request = () => createLink(jsonRequest("/api/v1/affiliates/links", "POST", { label: "Once" }, { "idempotency-key": `key-${user.id}` }));
    const first = await readJson(await request());
    const second = await readJson(await request());
    expect(second.data.id).toBe(first.data.id);
    const rows = await getDb().select().from(affiliateLinks).where(eq(affiliateLinks.label, "Once"));
    expect(rows).toHaveLength(1);
  });

  it("edits only the caller's own links: another affiliate's link is 404", async () => {
    await enrolledMember("owner");
    const link = (await readJson(await createLink(jsonRequest("/api/v1/affiliates/links", "POST", { discountBps: 0 })))).data;

    const patched = await updateLink(jsonRequest(`/api/v1/affiliates/links/${link.id}`, "PATCH", { label: "Renamed", expectedVersion: 1 }), params({ id: link.id }));
    expect(patched.status).toBe(200);
    expect((await readJson(patched)).data).toMatchObject({ label: "Renamed", version: 2, code: link.code });
    const stale = await updateLink(jsonRequest(`/api/v1/affiliates/links/${link.id}`, "PATCH", { label: "Late", expectedVersion: 1 }), params({ id: link.id }));
    expect(stale.status).toBe(409);
    const over = await updateLink(jsonRequest(`/api/v1/affiliates/links/${link.id}`, "PATCH", { discountBps: 5000 }), params({ id: link.id }));
    expect((await readJson(over)).error?.code).toBe("over_budget");

    await enrolledMember("intruder");
    const foreign = await updateLink(jsonRequest(`/api/v1/affiliates/links/${link.id}`, "PATCH", { status: "archived" }), params({ id: link.id }));
    expect(foreign.status).toBe(404);
    expect((await readJson(foreign)).error?.code).toBe("not_found");
  });

  it("previews the commission a discount leaves", async () => {
    await enrolledMember();
    const inside = (await readJson(await preview(getRequest("/api/v1/affiliates/preview?discountBps=500&priceMinor=10000")))).data;
    expect(inside).toMatchObject({ budgetBps: 1000, discountBps: 500, commissionBps: 526, withinBudget: true, example: { priceMinor: 10000, discountMinor: 500, buyerPaysMinor: 9500 } });
    const over = (await readJson(await preview(getRequest("/api/v1/affiliates/preview?discountBps=1500")))).data;
    expect(over).toEqual({ budgetBps: 1000, discountBps: 1500, commissionBps: 0, withinBudget: false });
    expect((await preview(getRequest("/api/v1/affiliates/preview"))).status).toBe(400);
  });
});

describe("earnings reads", () => {
  it("shows conversions, ledger and payouts without the buyer's identity", async () => {
    const { user, affiliate, buyer } = await seedReferredSale();
    setCaller(asCaller({ id: user.id, email: user.email }, "api_key"));

    const conversions = await listConversions(getRequest("/api/v1/affiliates/conversions?limit=10"));
    const conversionsBody = await readJson(conversions);
    expect(conversionsBody.data.conversions).toHaveLength(1);
    expect(conversionsBody.data.conversions[0]).toMatchObject({ plan: "premium", netMinor: 50_000, commissionMinor: 5000, status: "pending" });

    const commissions = await readJson(await getCommissions(getRequest("/api/v1/affiliates/commissions")));
    expect(commissions.data.balances).toMatchObject({ pendingMinor: 5000, availableMinor: 0 });
    expect(commissions.data.ledger).toHaveLength(1);

    const payouts = await readJson(await listPayouts(getRequest("/api/v1/affiliates/payouts")));
    expect(payouts.data.payouts).toEqual([]);

    const me = await readJson(await getMe(getRequest("/api/v1/affiliates/me")));
    expect(me.data).toMatchObject({ affiliateId: affiliate.id, qualifyingCustomers: 1 });

    const serialized = JSON.stringify([conversionsBody, commissions, payouts, me]);
    expect(serialized).not.toContain(buyer.id);
    expect(serialized).not.toContain(buyer.email);
    expect((await listConversions(getRequest("/api/v1/affiliates/conversions?limit=abc"))).status).toBe(400);
  });
});

describe("payout method", () => {
  it("is session only: API keys and MCP delegations get 403 session_required", async () => {
    const user = await enrolledMember();
    const body = { type: "paypal", payeeType: "individual", residency: "other", paypalEmail: "payee@example.com" };

    setCaller(asCaller(user, "api_key"));
    for (const response of [await getPayoutMethod(getRequest("/api/v1/affiliates/payout-method")), await putPayoutMethod(jsonRequest("/api/v1/affiliates/payout-method", "PUT", body))]) {
      expect(response.status).toBe(403);
      expect((await readJson(response)).error?.code).toBe("session_required");
    }
    setCaller(asCaller(user, "delegation"), "mcp:write");
    const delegated = await putPayoutMethod(jsonRequest("/api/v1/affiliates/payout-method", "PUT", body));
    expect((await readJson(delegated)).error?.code).toBe("session_required");

    setCaller(asCaller(user, "session"));
    expect((await readJson(await getPayoutMethod(getRequest("/api/v1/affiliates/payout-method")))).data).toBeNull();
    const saved = await putPayoutMethod(jsonRequest("/api/v1/affiliates/payout-method", "PUT", body));
    expect(saved.status).toBe(200);
    const view = (await readJson(saved)).data;
    expect(view).toMatchObject({ type: "paypal", displayHint: "PayPal p•••@example.com" });
    expect(view.sealedDetails).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("payee@example.com");

    const invalid = await putPayoutMethod(jsonRequest("/api/v1/affiliates/payout-method", "PUT", { type: "paypal", payeeType: "individual", residency: "other" }));
    expect(invalid.status).toBe(400);
    expect((await readJson(invalid)).error?.code).toBe("invalid_input");
  });
});
