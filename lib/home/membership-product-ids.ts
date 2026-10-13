import { PRODUCT_IDS } from "@/lib/polar";
import type { BillingCycle, MembershipPlan } from "@/lib/constants/launch";

/** Polar product id for every plan × billing cycle. Resolved on the server from the environment. */
export type MembershipProductIds = Record<MembershipPlan, Record<BillingCycle, string>>;

export function membershipProductIds(): MembershipProductIds {
  return {
    premium: { quarterly: PRODUCT_IDS.PREMIUM_QUARTERLY, annual: PRODUCT_IDS.PREMIUM_ANNUAL },
    vip: { quarterly: PRODUCT_IDS.VIP_QUARTERLY, annual: PRODUCT_IDS.VIP_ANNUAL },
  };
}

/** Map a Polar product id back to its membership plan, or null for non-membership products. */
export function planForProductId(productId: string, ids: MembershipProductIds): MembershipPlan | null {
  for (const plan of Object.keys(ids) as MembershipPlan[]) {
    if (ids[plan].quarterly === productId || ids[plan].annual === productId) return plan;
  }
  return null;
}

export function allMembershipProductIds(ids: MembershipProductIds): string[] {
  return Object.values(ids).flatMap((byCycle) => [byCycle.quarterly, byCycle.annual]);
}
