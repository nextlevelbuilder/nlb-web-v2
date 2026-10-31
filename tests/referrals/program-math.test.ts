import { describe, expect, it } from "vitest";
import {
  BPS,
  commissionMinor,
  levelFor,
  maxCommissionBps,
  nextLevel,
  payoutAmounts,
  previewIncentive,
  reversalTarget,
  termsFor,
  withinBudget,
} from "@/lib/referrals/program-math";
import { DEFAULT_PROGRAM_RULES, validateProgramRules } from "@/lib/referrals/program-rules";

describe("incentive budget invariant", () => {
  it("c_max is the largest commission inside the budget for every discount", () => {
    for (const budget of [1000, 1500, 2000, 2500, 3000, 3500, 4500, 5000]) {
      for (let discount = 0; discount <= budget; discount += 50) {
        const c = maxCommissionBps(discount, budget);
        expect(withinBudget(discount, c, budget), `d=${discount} B=${budget} c=${c}`).toBe(true);
        if (discount < budget) expect(withinBudget(discount, c + 1, budget), `d=${discount} B=${budget} c+1`).toBe(false);
      }
    }
  });

  it("matches the issue examples", () => {
    expect(maxCommissionBps(0, 2000)).toBe(2000);
    expect(maxCommissionBps(1000, 2000)).toBe(1111);
    expect(maxCommissionBps(2000, 2000)).toBe(0);
    expect(withinBudget(1000, 1111, 2000)).toBe(true);
    expect(withinBudget(1000, 1112, 2000)).toBe(false);
  });

  it("clamps a discount above the budget and never returns negative terms", () => {
    expect(termsFor(3500, 2000)).toEqual({ budgetBps: 2000, discountBps: 2000, commissionBps: 0, discountClamped: true });
    expect(termsFor(-5, 2000)).toMatchObject({ discountBps: 0, commissionBps: 2000 });
    expect(withinBudget(1.5, 0, 2000)).toBe(false);
    expect(withinBudget(BPS, 0, BPS)).toBe(false);
  });
});

describe("levels", () => {
  it("rank by qualifying customers and report the next goal", () => {
    expect(levelFor(DEFAULT_PROGRAM_RULES, 0).key).toBe("starter");
    expect(levelFor(DEFAULT_PROGRAM_RULES, 5).key).toBe("builder");
    expect(levelFor(DEFAULT_PROGRAM_RULES, 49).key).toBe("partner");
    expect(levelFor(DEFAULT_PROGRAM_RULES, 1000).key).toBe("elite");
    expect(nextLevel(DEFAULT_PROGRAM_RULES, 3)).toMatchObject({ level: { key: "builder" }, customersNeeded: 2 });
    expect(nextLevel(DEFAULT_PROGRAM_RULES, 100)).toBeNull();
  });

  it("validates published rules", () => {
    expect(validateProgramRules(DEFAULT_PROGRAM_RULES)).toEqual(DEFAULT_PROGRAM_RULES);
    expect(() => validateProgramRules({ ...DEFAULT_PROGRAM_RULES, levels: [] })).toThrow();
    expect(() =>
      validateProgramRules({ ...DEFAULT_PROGRAM_RULES, levels: [{ key: "x", minCustomers: 0, ordinaryBudgetBps: 9500, memberBudgetBps: 9500 }] })
    ).toThrow();
  });
});

describe("rounding", () => {
  it("floors commission and rounds reversals up, capped at the commission", () => {
    expect(commissionMinor(9999, 1111)).toBe(1110);
    expect(commissionMinor(0, 2000)).toBe(0);
    expect(reversalTarget(1110, 9999, 1)).toBe(1);
    expect(reversalTarget(1110, 9999, 5000)).toBe(556);
    expect(reversalTarget(1110, 9999, 9999)).toBe(1110);
    expect(reversalTarget(1110, 9999, 20000)).toBe(1110);
    // Two partial refunds summing to the whole reverse exactly the whole commission.
    expect(reversalTarget(1110, 9999, 4000) + (reversalTarget(1110, 9999, 9999) - reversalTarget(1110, 9999, 4000))).toBe(1110);
  });

  it("previews the buyer price, commission and merchant share", () => {
    expect(previewIncentive(19_900, 1000, 1111)).toEqual({
      priceMinor: 19_900,
      discountMinor: 1990,
      buyerPaysMinor: 17_910,
      commissionMinor: 1989,
      merchantKeepsMinor: 15_921,
    });
  });

  it("splits a payout into service fee, withholding and net", () => {
    expect(payoutAmounts(10_001, 2000, 1000)).toEqual({ grossMinor: 10_001, serviceFeeMinor: 2000, withholdingMinor: 1000, netMinor: 7001 });
  });
});
