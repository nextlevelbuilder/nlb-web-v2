import type { MembershipPlan } from "@/lib/polar";

/**
 * Membership plans whose active subscription unlocks every course video.
 * Single source of truth: change this constant (or the COURSES_ACCESS_PLANS var) to widen access,
 * e.g. ["vip", "premium"]. Premium is deliberately excluded.
 */
export const COURSE_ACCESS_PLANS: readonly MembershipPlan[] = ["vip"];

/** Subscription statuses that count as "active" for course access. */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly string[] = ["active"];

const KNOWN_PLANS: readonly MembershipPlan[] = ["premium", "vip"];

function isMembershipPlan(value: string): value is MembershipPlan {
  return (KNOWN_PLANS as readonly string[]).includes(value);
}

/**
 * Parse a comma-separated plan list (the COURSES_ACCESS_PLANS var). Unknown names are ignored.
 * Missing, blank or entirely invalid values fall back to COURSE_ACCESS_PLANS so a typo can never
 * silently grant or revoke access for everyone. Use "none" to disable plan-based access explicitly.
 */
export function readCourseAccessPlans(raw: string | undefined | null): readonly MembershipPlan[] {
  if (!raw || !raw.trim()) return COURSE_ACCESS_PLANS;
  const tokens = raw.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 1 && tokens[0] === "none") return [];
  const plans = [...new Set(tokens.filter(isMembershipPlan))];
  if (plans.length === 0) {
    console.warn(`COURSES_ACCESS_PLANS="${raw}" has no known plan; using default ${COURSE_ACCESS_PLANS.join(",")}`);
    return COURSE_ACCESS_PLANS;
  }
  return plans;
}
