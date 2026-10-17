import { describe, expect, it } from "vitest";
import { resolveEffectiveTier, type MembershipSubscriptionState } from "@/lib/membership/effective-tier";
import { tierForProductId } from "@/lib/membership/tiers";
import { PRODUCT_IDS } from "@/lib/polar";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-17T06:00:00Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

function sub(overrides: Partial<MembershipSubscriptionState> = {}): MembershipSubscriptionState {
  return {
    tier: "premium",
    status: "active",
    currentPeriodEnd: at(30 * DAY),
    cancelAtPeriodEnd: false,
    pastDueSince: null,
    endedAt: null,
    ...overrides,
  };
}

describe("tierForProductId", () => {
  it("maps every sold plan interval and ignores everything else", () => {
    expect(tierForProductId(PRODUCT_IDS.PREMIUM_QUARTERLY)).toBe("premium");
    expect(tierForProductId(PRODUCT_IDS.PREMIUM_ANNUAL)).toBe("premium");
    expect(tierForProductId(PRODUCT_IDS.VIP_QUARTERLY)).toBe("vip");
    expect(tierForProductId(PRODUCT_IDS.VIP_ANNUAL)).toBe("vip");
    expect(tierForProductId(PRODUCT_IDS.DIRECTORY_STANDARD)).toBeNull();
    expect(tierForProductId("")).toBeNull();
    expect(tierForProductId(null)).toBeNull();
  });
});

describe("resolveEffectiveTier", () => {
  it("grants nothing without subscriptions or for unmapped products", () => {
    expect(resolveEffectiveTier([], NOW, 7)).toEqual({ tier: "none", validUntil: null, reason: "no_membership" });
    expect(resolveEffectiveTier([sub({ tier: null })], NOW, 7).tier).toBe("none");
  });

  it("grants active and trialing subscriptions until their period end", () => {
    expect(resolveEffectiveTier([sub()], NOW, 7)).toEqual({ tier: "premium", validUntil: at(30 * DAY), reason: "active" });
    expect(resolveEffectiveTier([sub({ status: "trialing", tier: "vip" })], NOW, 7)).toMatchObject({ tier: "vip", reason: "trialing" });
  });

  it("keeps an active renewing subscription even when the stored period end already passed", () => {
    expect(resolveEffectiveTier([sub({ currentPeriodEnd: at(-DAY) })], NOW, 7).tier).toBe("premium");
  });

  it("grants cancel-at-period-end only until the current period end (exclusive)", () => {
    const canceling = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(DAY) });
    expect(resolveEffectiveTier([canceling], NOW, 7)).toEqual({ tier: "premium", validUntil: at(DAY), reason: "cancel_at_period_end" });
    expect(resolveEffectiveTier([canceling], at(DAY), 7).tier).toBe("none");
    expect(resolveEffectiveTier([sub({ cancelAtPeriodEnd: true, currentPeriodEnd: null })], NOW, 7).tier).toBe("none");
  });

  it("grants past_due within the grace window counted from past_due_since, end exclusive", () => {
    const pastDue = sub({ status: "past_due", pastDueSince: at(-3 * DAY) });
    expect(resolveEffectiveTier([pastDue], NOW, 7)).toEqual({ tier: "premium", validUntil: at(4 * DAY), reason: "past_due_grace" });
    expect(resolveEffectiveTier([pastDue], at(4 * DAY - 1), 7).tier).toBe("premium");
    expect(resolveEffectiveTier([pastDue], at(4 * DAY), 7).tier).toBe("none");
    expect(resolveEffectiveTier([pastDue], NOW, 3).tier).toBe("none");
    expect(resolveEffectiveTier([pastDue], NOW, 0).tier).toBe("none");
  });

  it("falls back to the period end for past_due rows written before past_due_since existed", () => {
    const legacy = sub({ status: "past_due", pastDueSince: null, currentPeriodEnd: at(-2 * DAY) });
    expect(resolveEffectiveTier([legacy], NOW, 7).validUntil).toEqual(at(5 * DAY));
    expect(resolveEffectiveTier([sub({ status: "past_due", pastDueSince: null, currentPeriodEnd: null })], NOW, 7).tier).toBe("none");
  });

  it("grants nothing for revoked, refunded, canceled, unpaid or incomplete subscriptions", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "refunded"]) {
      expect(resolveEffectiveTier([sub({ status })], NOW, 7).tier).toBe("none");
    }
    // Revoked: Polar reports canceled with ended_at; a stale active state with ended_at is still ended.
    expect(resolveEffectiveTier([sub({ endedAt: at(-1) })], NOW, 7).tier).toBe("none");
    expect(resolveEffectiveTier([sub({ endedAt: NOW })], NOW, 7).tier).toBe("none");
  });

  it("lets VIP win over Premium regardless of order or end date", () => {
    const premium = sub({ tier: "premium", currentPeriodEnd: at(300 * DAY) });
    const vip = sub({ tier: "vip", cancelAtPeriodEnd: true, currentPeriodEnd: at(2 * DAY) });
    expect(resolveEffectiveTier([premium, vip], NOW, 7).tier).toBe("vip");
    expect(resolveEffectiveTier([vip, premium], NOW, 7).tier).toBe("vip");
    // Once the VIP period ends, the overlapping Premium subscription still grants Premium.
    expect(resolveEffectiveTier([premium, vip], at(2 * DAY), 7)).toMatchObject({ tier: "premium", validUntil: at(300 * DAY) });
  });

  it("reports the longest-lasting grant among overlapping subscriptions of the same tier", () => {
    const short = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(5 * DAY) });
    const long = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(40 * DAY) });
    const renewing = sub({ currentPeriodEnd: null });
    expect(resolveEffectiveTier([short, long], NOW, 7).validUntil).toEqual(at(40 * DAY));
    expect(resolveEffectiveTier([long, short], NOW, 7).validUntil).toEqual(at(40 * DAY));
    expect(resolveEffectiveTier([long, renewing], NOW, 7)).toMatchObject({ validUntil: null, reason: "active" });
  });

  it("follows an upgrade and a downgrade of the same subscription through its mapped tier", () => {
    expect(resolveEffectiveTier([sub({ tier: tierForProductId(PRODUCT_IDS.VIP_ANNUAL) })], NOW, 7).tier).toBe("vip");
    expect(resolveEffectiveTier([sub({ tier: tierForProductId(PRODUCT_IDS.PREMIUM_QUARTERLY) })], NOW, 7).tier).toBe("premium");
  });

  it("combines a lapsed VIP past_due with an active Premium", () => {
    const lapsedVip = sub({ tier: "vip", status: "past_due", pastDueSince: at(-8 * DAY) });
    expect(resolveEffectiveTier([lapsedVip, sub()], NOW, 7).tier).toBe("premium");
    expect(resolveEffectiveTier([lapsedVip], NOW, 9).tier).toBe("vip");
  });
});
