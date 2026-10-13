/**
 * Membership launch configuration: prices, seat caps and the early-bird deadline.
 * Change values here; the homepage, JSON-LD and FOMO widgets all read from this file.
 */

export type MembershipPlan = "premium" | "vip";
export type BillingCycle = "quarterly" | "annual";

export const MEMBERSHIP_PLANS: readonly MembershipPlan[] = ["premium", "vip"] as const;

/** Seats offered per plan in the current round. Seat counts are real active subscriptions. */
export const MEMBERSHIP_SEAT_CAPS: Record<MembershipPlan, number> = {
  premium: 30,
  vip: 10,
};

/**
 * Prices in USD. Quarterly is billed every 3 months; annual is billed once per year
 * (`perMonth` is the advertised monthly equivalent).
 */
export const MEMBERSHIP_PRICES: Record<MembershipPlan, Record<BillingCycle, { amount: number; perMonth: number }>> = {
  premium: {
    quarterly: { amount: 147, perMonth: 49 },
    annual: { amount: 468, perMonth: 39 },
  },
  vip: {
    quarterly: { amount: 297, perMonth: 99 },
    annual: { amount: 948, perMonth: 79 },
  },
};

/** Early-bird pricing ends at this instant (2026-10-31 23:59 GMT+7). */
export const EARLY_BIRD_DEADLINE_ISO = "2026-10-31T23:59:00+07:00";

/** Plan preselected for the hero / finale checkout when the visitor has not chosen one. */
export const DEFAULT_PLAN: MembershipPlan = "vip";
export const DEFAULT_BILLING: BillingCycle = "quarterly";

/** Only show activity from this many days back; older events are not "recent". */
export const ACTIVITY_WINDOW_DAYS = 14;
export const ACTIVITY_MAX_ITEMS = 8;
