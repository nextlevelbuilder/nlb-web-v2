import { and, eq, inArray } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { MEMBERSHIP_PLANS, MEMBERSHIP_SEAT_CAPS, type MembershipPlan } from "@/lib/constants/launch";
import { allMembershipProductIds, planForProductId, type MembershipProductIds } from "./membership-product-ids";

export interface PlanSeats {
  total: number;
  taken: number;
  left: number;
  soldOut: boolean;
}

export type SeatAvailability = Record<MembershipPlan, PlanSeats>;

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Seats left per plan = cap − active members, clamped to [0, cap]. Never negative, never above the cap,
 * and a missing or invalid count is treated as zero members.
 */
export function computeSeatAvailability(
  takenByPlan: Partial<Record<MembershipPlan, number>>,
  caps: Record<MembershipPlan, number> = MEMBERSHIP_SEAT_CAPS,
): SeatAvailability {
  const result = {} as SeatAvailability;
  for (const plan of MEMBERSHIP_PLANS) {
    const total = toCount(caps[plan]);
    const taken = Math.min(toCount(takenByPlan[plan]), total);
    const left = total - taken;
    result[plan] = { total, taken, left, soldOut: left === 0 };
  }
  return result;
}

/**
 * Count distinct customers with an `active` membership subscription, per plan. A member holding both
 * billing cycles of the same plan occupies one seat, so customers are de-duplicated per plan, not per product.
 */
export async function countActiveMembersByPlan(
  ids: MembershipProductIds,
  db: AppDb = getDb(),
): Promise<Record<MembershipPlan, number>> {
  const rows = await db
    .selectDistinct({ productId: subscriptions.polarProductId, customerId: subscriptions.customerId })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), inArray(subscriptions.polarProductId, allMembershipProductIds(ids))));

  const members: Record<MembershipPlan, Set<string>> = { premium: new Set(), vip: new Set() };
  for (const row of rows) {
    const plan = planForProductId(row.productId, ids);
    if (plan) members[plan].add(row.customerId);
  }
  return { premium: members.premium.size, vip: members.vip.size };
}

export async function getMembershipSeatAvailability(ids: MembershipProductIds, db?: AppDb): Promise<SeatAvailability> {
  return computeSeatAvailability(await countActiveMembersByPlan(ids, db));
}
