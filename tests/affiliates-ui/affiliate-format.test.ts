import { describe, expect, it } from "vitest";
import { budgetSplitExample, formatBps, formatDate, formatMoney, levelProgressPercent, titleCaseKey } from "@/components/affiliates/affiliate-format";
import { DESTINATION_KEYS, destinationPath, parseDestination } from "@/components/affiliates/affiliate-destinations";
import { errorKey, AffiliateApiError } from "@/components/affiliates/affiliate-api";
import { referralCodeFromSearch } from "@/components/home/checkout-context";
import { DEFAULT_PROGRAM_RULES } from "@/lib/referrals/program-rules";
import { MEMBERSHIP_PRICES } from "@/lib/constants/launch";

describe("affiliate display formatting", () => {
  it("formats minor units and basis points per locale", () => {
    expect(formatMoney(1469, "usd", "en")).toBe("$14.69");
    expect(formatMoney(1469, "usd", "vi")).toMatch(/14,69/);
    expect(formatMoney(100, "not-a-code", "en")).toBe("$1.00");
    expect(formatBps(2000, "en")).toBe("20%");
    expect(formatBps(1111, "en")).toBe("11.11%");
    expect(formatBps(1111, "vi")).toMatch(/11,11/);
  });

  it("formats dates in UTC and passes unparseable input through", () => {
    expect(formatDate("2026-10-31T23:30:00Z", "en")).toBe("Oct 31, 2026");
    expect(formatDate("not a date", "en")).toBe("not a date");
  });

  it("title-cases level keys an operator added after the copy was written", () => {
    expect(titleCaseKey("gold-tier")).toBe("Gold Tier");
    expect(titleCaseKey("vip_plus")).toBe("Vip Plus");
  });

  it("measures progress between level thresholds and caps it", () => {
    expect(levelProgressPercent(0, 0, 5)).toBe(0);
    expect(levelProgressPercent(3, 0, 5)).toBe(60);
    expect(levelProgressPercent(9, 5, 20)).toBe(27);
    expect(levelProgressPercent(150, 100, null)).toBe(100);
    expect(levelProgressPercent(30, 20, 20)).toBe(100);
  });
});

describe("budget split example", () => {
  it("splits the entry member budget in half on the Premium quarterly price", () => {
    const price = MEMBERSHIP_PRICES.premium.quarterly.amount * 100;
    const example = budgetSplitExample(DEFAULT_PROGRAM_RULES.levels, price);
    expect(example).toMatchObject({ levelKey: "starter", budgetBps: 2000, discountBps: 1000, commissionBps: 1111, zeroDiscountCommissionBps: 2000 });
    expect(example.preview.priceMinor).toBe(price);
    expect(example.preview.buyerPaysMinor + example.preview.discountMinor).toBe(price);
    expect(example.preview.commissionMinor + example.preview.merchantKeepsMinor).toBe(example.preview.buyerPaysMinor);
  });

  it("matches the worked numbers on a $147 price", () => {
    const { preview } = budgetSplitExample(DEFAULT_PROGRAM_RULES.levels, 14700);
    expect(preview).toEqual({ priceMinor: 14700, discountMinor: 1470, buyerPaysMinor: 13230, commissionMinor: 1469, merchantKeepsMinor: 11761 });
  });

  it("uses the lowest threshold even when levels arrive unsorted", () => {
    const levels = [...DEFAULT_PROGRAM_RULES.levels].reverse();
    expect(budgetSplitExample(levels, 10000).levelKey).toBe("starter");
  });
});

describe("link destinations", () => {
  it("builds allowlisted landing paths in both languages and parses them back", () => {
    expect(destinationPath("home", "en")).toBe("/");
    expect(destinationPath("pricing", "en")).toBe("/#pricing");
    expect(destinationPath("home", "vi")).toBe("/vi");
    expect(destinationPath("pricing", "vi")).toBe("/vi#pricing");
    expect(destinationPath("affiliates", "vi")).toBe("/vi/affiliates");
    for (const key of DESTINATION_KEYS) {
      for (const language of ["en", "vi"] as const) expect(parseDestination(destinationPath(key, language))).toEqual({ key, language });
    }
    expect(parseDestination("/products/abc")).toBeNull();
  });
});

describe("referral code from the checkout URL", () => {
  it("accepts a well-formed code and normalises case", () => {
    expect(referralCodeFromSearch("?ref=Duy-Builds&utm_source=affiliate")).toBe("duy-builds");
    expect(referralCodeFromSearch("?ref=abcd")).toBe("abcd");
  });

  it("ignores missing, short, long or unsafe values", () => {
    expect(referralCodeFromSearch("")).toBeNull();
    expect(referralCodeFromSearch("?ref=abc")).toBeNull();
    expect(referralCodeFromSearch(`?ref=${"a".repeat(33)}`)).toBeNull();
    expect(referralCodeFromSearch("?ref=%3Cscript%3E")).toBeNull();
    expect(referralCodeFromSearch("?ref=a_b_c_d")).toBeNull();
  });
});

describe("affiliate API error mapping", () => {
  it("maps known codes, rate limits and unknown failures to translation keys", () => {
    expect(errorKey(new AffiliateApiError(409, "code_taken", "taken"))).toBe("code_taken");
    expect(errorKey(new AffiliateApiError(429, "whatever", "slow down"))).toBe("rate_limited");
    expect(errorKey(new AffiliateApiError(500, "boom", "x"))).toBe("generic");
    expect(errorKey(new Error("plain"))).toBe("generic");
  });
});
