import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { customers, subscriptions } from "@/lib/db/schema";
import { ACTIVITY_MAX_ITEMS, ACTIVITY_WINDOW_DAYS, type MembershipPlan } from "@/lib/constants/launch";
import { allMembershipProductIds, planForProductId, type MembershipProductIds } from "./membership-product-ids";

/** A real, recent membership join. Only a first name ever leaves the server. */
export interface MembershipActivity {
  key: string;
  firstName: string | null;
  plan: MembershipPlan;
  occurredAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_FIRST_NAME_LENGTH = 24;

/**
 * Reduce a stored customer name to a displayable first name: first word, letters (any script),
 * apostrophes and hyphens only. Returns null when nothing safe remains (e.g. an email address).
 */
export function toFirstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (first.includes("@")) return null;
  const cleaned = first.normalize("NFC").replace(/[^\p{L}\p{M}'-]/gu, "").slice(0, MAX_FIRST_NAME_LENGTH);
  if (!/\p{L}/u.test(cleaned)) return null;
  return cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1);
}

/**
 * Members who joined a plan within the activity window, newest first.
 * Returns [] when there are none; callers must render nothing in that case.
 */
export async function getRecentMembershipActivity(
  ids: MembershipProductIds,
  { db = getDb(), now = Date.now(), windowDays = ACTIVITY_WINDOW_DAYS, limit = ACTIVITY_MAX_ITEMS }: {
    db?: AppDb; now?: number; windowDays?: number; limit?: number;
  } = {},
): Promise<MembershipActivity[]> {
  const rows = await db
    .select({ productId: subscriptions.polarProductId, createdAt: subscriptions.createdAt, name: customers.name })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(and(
      eq(subscriptions.status, "active"),
      inArray(subscriptions.polarProductId, allMembershipProductIds(ids)),
      gte(subscriptions.createdAt, new Date(now - windowDays * DAY_MS)),
    ))
    .orderBy(desc(subscriptions.createdAt))
    .limit(limit);

  return rows.flatMap((row, index) => {
    const plan = planForProductId(row.productId, ids);
    if (!plan) return [];
    const occurredAt = row.createdAt.getTime();
    return [{ key: `${occurredAt}-${index}`, firstName: toFirstName(row.name), plan, occurredAt }];
  });
}
