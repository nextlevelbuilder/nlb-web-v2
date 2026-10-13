import { describe, expect, it } from "vitest";
import { COURSE_ACCESS_PLANS, readCourseAccessPlans } from "@/lib/courses/course-access-policy";
import { PRODUCT_IDS, productIdsForPlans } from "@/lib/polar";

describe("course access policy", () => {
  it("defaults to VIP only", () => {
    expect(COURSE_ACCESS_PLANS).toEqual(["vip"]);
    expect(readCourseAccessPlans(undefined)).toEqual(["vip"]);
    expect(readCourseAccessPlans("  ")).toEqual(["vip"]);
  });

  it("reads a comma-separated plan list from the env var", () => {
    expect(readCourseAccessPlans("vip")).toEqual(["vip"]);
    expect(readCourseAccessPlans("VIP, premium")).toEqual(["vip", "premium"]);
    expect(readCourseAccessPlans("none")).toEqual([]);
  });

  it("falls back to the constant when the var names no known plan", () => {
    expect(readCourseAccessPlans("platinum")).toEqual(["vip"]);
  });

  it("maps plans to every billing interval's Polar product", () => {
    expect(productIdsForPlans(["vip"]).sort()).toEqual([PRODUCT_IDS.VIP_QUARTERLY, PRODUCT_IDS.VIP_ANNUAL].sort());
    expect(productIdsForPlans(["vip"])).not.toContain(PRODUCT_IDS.PREMIUM_ANNUAL);
  });
});
