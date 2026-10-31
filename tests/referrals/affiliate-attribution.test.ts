import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { affiliateAttributions, affiliateLinkClicks, orders } from "@/lib/db/schema";
import { attributeCheckout, formatAffiliateCookie, parseAffiliateCookie } from "@/lib/referrals/affiliate-checkout";
import { createLink, normalizeDestination, recordLinkClick, clickCounts, updateLink } from "@/lib/referrals/affiliate-links";
import { enrollAffiliate, affiliateStanding } from "@/lib/referrals/affiliates";
import { AFFILIATE_TERMS_VERSION } from "@/lib/referrals/program-rules";
import { createMember } from "../helpers/onboarding-fixtures";
import { DAY, PREMIUM, TOOLKIT, fakeDiscounts, nextSeq, seedAffiliate, seedAffiliateWithLink, seedUser } from "./referral-fixtures";

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("enrolment", () => {
  it("requires the current agreement version and a verified account, once", async () => {
    const user = await seedUser("enrol");
    await expect(enrollAffiliate(getDb(), user.id, { termsVersion: "2020-01-01" })).rejects.toMatchObject({ code: "terms_not_accepted" });
    const row = await enrollAffiliate(getDb(), user.id, { termsVersion: AFFILIATE_TERMS_VERSION });
    expect(row).toMatchObject({ userId: user.id, status: "active", termsVersion: AFFILIATE_TERMS_VERSION });
    await expect(enrollAffiliate(getDb(), user.id, { termsVersion: AFFILIATE_TERMS_VERSION })).rejects.toMatchObject({ code: "already_enrolled" });

    const unverified = await seedUser("unverified", { verified: false });
    await expect(enrollAffiliate(getDb(), unverified.id, { termsVersion: AFFILIATE_TERMS_VERSION })).rejects.toMatchObject({ code: "account_not_eligible" });
  });

  it("uses the member budget for an active member and the ordinary budget otherwise", async () => {
    const { affiliate } = await seedAffiliate("ordinary");
    expect((await affiliateStanding(getDb(), affiliate)).budgetBps).toBe(1000);
    const memberUser = await seedUser("member");
    await createMember({ id: memberUser.id, email: memberUser.email, emailVerified: true, role: "user" }, { productId: PREMIUM });
    const member = await enrollAffiliate(getDb(), memberUser.id, { termsVersion: AFFILIATE_TERMS_VERSION });
    expect(await affiliateStanding(getDb(), member)).toMatchObject({ basis: "member", budgetBps: 2000, level: { key: "starter" } });
  });
});

describe("links", () => {
  it("refuses an over-budget discount, a taken code and unsafe destinations", async () => {
    const { affiliate } = await seedAffiliate();
    await expect(createLink(getDb(), affiliate, { code: "too-much", discountBps: 1001 })).rejects.toMatchObject({ code: "over_budget", status: 422 });
    const link = await createLink(getDb(), affiliate, { code: "fair-deal", discountBps: 1000, destinationPath: "/courses#pricing" });
    expect(link).toMatchObject({ code: "fair-deal", discountBps: 1000, destinationPath: "/courses#pricing", version: 1 });
    const other = await seedAffiliate();
    await expect(createLink(getDb(), other.affiliate, { code: "fair-deal" })).rejects.toMatchObject({ code: "code_taken" });
    await expect(createLink(getDb(), affiliate, { code: "admin" })).rejects.toMatchObject({ status: 400 });

    for (const bad of ["https://evil.example", "//evil.example", "/api/v1/me", "/courses?x=1", "/../admin", "/account"]) {
      expect(() => normalizeDestination(bad), bad).toThrow();
    }
    expect(normalizeDestination("/vi/live")).toBe("/vi/live");
  });

  it("updates with an optimistic version and keeps the code immutable", async () => {
    const { affiliate, link } = await seedAffiliateWithLink(0);
    const updated = await updateLink(getDb(), affiliate, link.id, { discountBps: 500, expectedVersion: 1 });
    expect(updated).toMatchObject({ discountBps: 500, version: 2, code: link.code });
    await expect(updateLink(getDb(), affiliate, link.id, { discountBps: 600, expectedVersion: 1 })).rejects.toMatchObject({ code: "conflict" });
    await expect(updateLink(getDb(), affiliate, link.id, { discountBps: 5000, expectedVersion: 2 })).rejects.toMatchObject({ code: "over_budget" });
  });

  it("counts a visitor once per link per day", async () => {
    const { link } = await seedAffiliateWithLink(0);
    const now = new Date("2026-10-30T10:00:00Z");
    await recordLinkClick(getDb(), link.id, "visitor-a", now);
    await recordLinkClick(getDb(), link.id, "visitor-a", new Date(now.getTime() + 1000));
    await recordLinkClick(getDb(), link.id, "visitor-b", now);
    await recordLinkClick(getDb(), link.id, "visitor-a", new Date(now.getTime() + DAY));
    expect((await clickCounts(getDb(), [link.id])).get(link.id)).toBe(3);
    const rows = await getDb().select().from(affiliateLinkClicks).where(eq(affiliateLinkClicks.linkId, link.id));
    expect(rows).toHaveLength(3);
  });
});

describe("checkout attribution", () => {
  it("snapshots terms, reuses one Polar discount per rate and skips repeat buyers", async () => {
    const { link, affiliate } = await seedAffiliateWithLink(500, `snap-${nextSeq()}`);
    const polar = fakeDiscounts();
    const buyer = await seedUser("buyer");
    const result = await attributeCheckout(getDb(), polar, { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: link.code });
    expect(result).toMatchObject({ applied: true, code: link.code, discountBps: 500, source: "code" });
    if (!result.applied) throw new Error("expected applied");
    const [snapshot] = await getDb().select().from(affiliateAttributions).where(eq(affiliateAttributions.id, result.attributionId));
    expect(snapshot).toMatchObject({ affiliateId: affiliate.id, budgetBps: 1000, discountBps: 500, commissionBps: 526, level: "starter", incentiveBasis: "ordinary", status: "pending" });

    const second = await seedUser("buyer");
    await attributeCheckout(getDb(), polar, { buyerUserId: second.id, polarProductId: PREMIUM, explicitCode: link.code });
    expect(polar.calls).toBe(1);
  });

  it("skips self-referral, ineligible products, unknown codes and stale cookies", async () => {
    const { link, user } = await seedAffiliateWithLink(0);
    const polar = fakeDiscounts();
    const buyer = await seedUser("buyer");
    const now = new Date();
    expect(await attributeCheckout(getDb(), polar, { buyerUserId: user.id, polarProductId: PREMIUM, explicitCode: link.code })).toEqual({ applied: false, reason: "self_referral" });
    expect(await attributeCheckout(getDb(), polar, { buyerUserId: buyer.id, polarProductId: TOOLKIT, explicitCode: link.code })).toEqual({ applied: false, reason: "offer_not_eligible" });
    expect(await attributeCheckout(getDb(), polar, { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: "nope-nope" })).toEqual({ applied: false, reason: "unknown_code" });
    const stale = formatAffiliateCookie(link.code, new Date(now.getTime() - 31 * DAY));
    expect(await attributeCheckout(getDb(), polar, { buyerUserId: buyer.id, polarProductId: PREMIUM, cookieValue: stale, now })).toEqual({ applied: false, reason: "no_referral" });
    const fresh = formatAffiliateCookie(link.code, new Date(now.getTime() - 29 * DAY));
    expect(await attributeCheckout(getDb(), polar, { buyerUserId: buyer.id, polarProductId: PREMIUM, cookieValue: fresh, now })).toMatchObject({ applied: true, source: "cookie" });
    expect(polar.calls).toBe(0);
  });

  it("lets an explicit code win over the cookie and ignores everything while disabled", async () => {
    const first = await seedAffiliateWithLink(0);
    const second = await seedAffiliateWithLink(0);
    const buyer = await seedUser("buyer");
    const cookie = formatAffiliateCookie(first.link.code, new Date());
    const result = await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: second.link.code, cookieValue: cookie });
    expect(result).toMatchObject({ applied: true, code: second.link.code, source: "code" });

    vi.stubEnv("AFFILIATES_ENABLED", "false");
    expect(await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: second.link.code })).toEqual({ applied: false, reason: "disabled" });
  });

  it("refuses buyers who already paid for a membership", async () => {
    const { link } = await seedAffiliateWithLink(0);
    const buyerUser = await seedUser("returning");
    const customer = await createMember({ id: buyerUser.id, email: buyerUser.email, emailVerified: true, role: "user" }, { productId: PREMIUM });
    await getDb().insert(orders).values({
      customerId: customer.id,
      polarOrderId: `order-prior-${nextSeq()}`,
      polarProductId: PREMIUM,
      productName: "Premium",
      amount: "199",
      currency: "usd",
      status: "paid",
      paidAt: new Date(),
    });
    const result = await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyerUser.id, polarProductId: PREMIUM, explicitCode: link.code });
    expect(result).toEqual({ applied: false, reason: "not_first_purchase" });
  });

  it("parses only well-formed cookies", () => {
    expect(parseAffiliateCookie("abcd.1700000000000")).toMatchObject({ code: "abcd" });
    expect(parseAffiliateCookie("ab.1700000000000")).toBeNull();
    expect(parseAffiliateCookie("abcd.x")).toBeNull();
    expect(parseAffiliateCookie(undefined)).toBeNull();
  });
});
