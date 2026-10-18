import { EARLYBIRD_MEMBERSHIP_PRODUCT_IDS, MEMBERSHIP_PLAN_PRODUCT_IDS, type MembershipPlan } from "@/lib/polar";

export type PaidMembershipTier = MembershipPlan;

/**
 * Membership tier granted by a Polar product id, from the server env mapping. Early-bird annual
 * products count as their plan for entitlement even though checkout no longer offers them.
 */
export function tierForProductId(productId: string | null | undefined): PaidMembershipTier | null {
  if (!productId) return null;
  for (const tier of ["vip", "premium"] as const) {
    if (MEMBERSHIP_PLAN_PRODUCT_IDS[tier].includes(productId)) return tier;
    if (EARLYBIRD_MEMBERSHIP_PRODUCT_IDS[tier] && EARLYBIRD_MEMBERSHIP_PRODUCT_IDS[tier] === productId) return tier;
  }
  return null;
}
