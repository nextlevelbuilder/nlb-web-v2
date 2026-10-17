import type { PaidMembershipTier } from "./tiers";

export type MembershipTier = "none" | PaidMembershipTier;

/** The subscription facts the resolver needs; `tier` is already mapped from the product id. */
export interface MembershipSubscriptionState {
  tier: PaidMembershipTier | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  pastDueSince: Date | null;
  endedAt: Date | null;
}

export type EffectiveTierReason =
  | "active"
  | "trialing"
  | "cancel_at_period_end"
  | "past_due_grace"
  | "no_membership";

export interface EffectiveTier {
  tier: MembershipTier;
  /** When the grant lapses unless Polar reports otherwise; null when it renews with no known end. */
  validUntil: Date | null;
  reason: EffectiveTierReason;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_RANK: Record<MembershipTier, number> = { none: 0, premium: 1, vip: 2 };
const NONE: EffectiveTier = { tier: "none", validUntil: null, reason: "no_membership" };

/**
 * What one subscription grants at `now`:
 * - an ended subscription (revoked, expired or fully refunded) grants nothing;
 * - `active`/`trialing` grant; with `cancel_at_period_end` only until `current_period_end`;
 * - `past_due` grants for `graceDays` from `past_due_since` (end exclusive);
 * - every other status (`canceled`, `unpaid`, `incomplete`, ...) grants nothing.
 */
function grantFor(sub: MembershipSubscriptionState, now: Date, graceDays: number): EffectiveTier {
  if (!sub.tier) return NONE;
  if (sub.endedAt && sub.endedAt.getTime() <= now.getTime()) return NONE;

  switch (sub.status) {
    case "active":
    case "trialing": {
      if (sub.cancelAtPeriodEnd) {
        if (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() <= now.getTime()) return NONE;
        return { tier: sub.tier, validUntil: sub.currentPeriodEnd, reason: "cancel_at_period_end" };
      }
      return { tier: sub.tier, validUntil: sub.currentPeriodEnd, reason: sub.status === "trialing" ? "trialing" : "active" };
    }
    case "past_due": {
      // A row written before `past_due_since` existed falls back to the period end it failed to renew at.
      const since = sub.pastDueSince ?? sub.currentPeriodEnd;
      if (!since) return NONE;
      const graceEnd = new Date(since.getTime() + graceDays * DAY_MS);
      if (now.getTime() >= graceEnd.getTime()) return NONE;
      return { tier: sub.tier, validUntil: graceEnd, reason: "past_due_grace" };
    }
    default:
      return NONE;
  }
}

/** Later end wins; an open-ended grant (null) outlasts any dated one. */
function outlasts(a: EffectiveTier, b: EffectiveTier): boolean {
  if (a.validUntil === null) return b.validUntil !== null;
  if (b.validUntil === null) return false;
  return a.validUntil.getTime() > b.validUntil.getTime();
}

/**
 * Effective membership tier over every subscription a user owns. Pure: same input, same answer.
 * VIP wins over Premium; among grants of the same tier the longest-lasting one is reported.
 */
export function resolveEffectiveTier(
  subs: readonly MembershipSubscriptionState[],
  now: Date,
  graceDays: number
): EffectiveTier {
  let best = NONE;
  for (const sub of subs) {
    const grant = grantFor(sub, now, graceDays);
    if (grant.tier === "none") continue;
    const rankDiff = TIER_RANK[grant.tier] - TIER_RANK[best.tier];
    if (rankDiff > 0 || (rankDiff === 0 && outlasts(grant, best))) best = grant;
  }
  return best;
}
