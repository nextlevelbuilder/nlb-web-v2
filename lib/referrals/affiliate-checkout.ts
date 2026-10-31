/**
 * Binds a membership checkout to a referral. Everything is decided server-side from trusted state:
 * the signed-in buyer, the link code (explicit code first, else a click cookie inside the attribution
 * window), the affiliate's current level and membership, and the active program rules. The result is
 * an immutable snapshot row (`affiliate_attributions`) whose id travels in Polar metadata; the
 * webhook reads the snapshot, never the client. See docs/affiliate-program-adr.md.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Polar } from "@polar-sh/sdk";
import type { AppDb } from "@/lib/db";
import { affiliateAttributions, affiliateConversions, affiliatePolarDiscounts, customers, orders } from "@/lib/db/schema";
import { MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS, productIdsForPlans } from "@/lib/polar";
import { tierForProductId } from "@/lib/membership/tiers";
import { isUniqueViolation } from "@/lib/membership/member-access";
import { affiliateStanding, assertEligibleUser, findAffiliateById, type AffiliateRow } from "./affiliates";
import { findActiveLinkByCode, type AffiliateLinkRow } from "./affiliate-links";
import { termsFor } from "./program-math";
import { getActiveRules } from "./program-rules";
import { ReferralError } from "./referral-errors";
import { isAffiliatesEnabled } from "./referral-env";
import type { AffiliateAttributionSource } from "./types";

/** Polar metadata key carrying the attribution id. */
export const AFFILIATE_METADATA_KEY = "nlb_aff_attr";
/** First-party click cookie: `<code>.<clicked-at epoch ms>`. */
export const AFFILIATE_COOKIE = "nlb_aff";
/** How long a checkout binding may wait for its paid order (covers slow settlement). */
export const ATTRIBUTION_BINDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ReferralDiscountsClient {
  discounts: Pick<Polar["discounts"], "create">;
}

export type AttributionAttempt =
  | { applied: true; attributionId: string; polarDiscountId: string | null; code: string; discountBps: number; source: AffiliateAttributionSource }
  | { applied: false; reason: ReferralSkipReason };

export type ReferralSkipReason =
  | "disabled"
  | "no_referral"
  | "unknown_code"
  | "offer_not_eligible"
  | "self_referral"
  | "not_first_purchase"
  | "affiliate_inactive"
  | "buyer_not_eligible"
  /** Attribution failed (database or Polar discount error); the checkout continues without a referral. */
  | "unavailable";

export function parseAffiliateCookie(value: string | null | undefined): { code: string; clickedAt: Date } | null {
  if (!value) return null;
  const match = /^([a-z0-9-]{4,32})\.(\d{10,16})$/.exec(value.trim());
  if (!match) return null;
  const clickedAt = new Date(Number(match[2]));
  return Number.isNaN(clickedAt.getTime()) ? null : { code: match[1], clickedAt };
}

export function formatAffiliateCookie(code: string, clickedAt: Date): string {
  return `${code}.${clickedAt.getTime()}`;
}

/** Whether the buyer ever had a paid (or refunded) membership order or an earlier referral. */
export async function hasPriorMembershipPurchase(db: AppDb, buyerUserId: string): Promise<boolean> {
  const [conversion] = await db.select({ id: affiliateConversions.id }).from(affiliateConversions).where(eq(affiliateConversions.buyerUserId, buyerUserId)).limit(1);
  if (conversion) return true;
  const membershipIds = [...MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS];
  if (membershipIds.length === 0) return false;
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(customers.userId, buyerUserId),
        inArray(orders.polarProductId, membershipIds),
        sql`(${orders.paidAt} is not null or ${orders.status} in ('paid', 'refunded', 'partially_refunded'))`
      )
    )
    .limit(1);
  return Boolean(order);
}

/** Product ids that earn commission under the active rules (sold plans only, never early-bird). */
export function eligibleProductIds(plans: Array<"premium" | "vip">): string[] {
  return productIdsForPlans(plans).filter(Boolean).sort();
}

/** Reuses (or creates once) a Polar percentage discount for the first charge, limited to eligible products. */
export async function ensurePolarDiscount(db: AppDb, client: ReferralDiscountsClient, discountBps: number, productIds: string[]): Promise<string> {
  const productsKey = productIds.join(",");
  const find = async () =>
    (
      await db
        .select({ polarDiscountId: affiliatePolarDiscounts.polarDiscountId })
        .from(affiliatePolarDiscounts)
        .where(and(eq(affiliatePolarDiscounts.discountBps, discountBps), eq(affiliatePolarDiscounts.productsKey, productsKey)))
        .limit(1)
    )[0]?.polarDiscountId;
  const existing = await find();
  if (existing) return existing;

  let created: { id: string };
  try {
    created = await client.discounts.create({
      type: "percentage",
      duration: "once",
      basisPoints: discountBps,
      name: `NLB referral ${discountBps / 100}% (first payment)`,
      products: productIds,
      metadata: { nlb_kind: "affiliate_referral", nlb_discount_bps: discountBps },
    } as Parameters<Polar["discounts"]["create"]>[0]);
  } catch (error) {
    console.error("referral discount creation failed", { discountBps, error: error instanceof Error ? error.message : "unknown" });
    throw new ReferralError(502, "discount_failed", "The referral discount could not be prepared; retry");
  }
  try {
    await db.insert(affiliatePolarDiscounts).values({ discountBps, productsKey, polarDiscountId: created.id });
    return created.id;
  } catch (error) {
    // A concurrent checkout stored one first; use it (the extra Polar discount is never applied).
    if (isUniqueViolation(error)) return (await find()) ?? created.id;
    throw error;
  }
}

export interface AttributeCheckoutInput {
  buyerUserId: string;
  polarProductId: string;
  /** Code the buyer brought to checkout (`?ref=` or typed). Wins over the cookie. */
  explicitCode?: string | null;
  cookieValue?: string | null;
  now?: Date;
}

/**
 * Decides whether this checkout is referred and, if so, stores the snapshot. A skipped or failed
 * referral never blocks the purchase: any error (database, Polar discount) is logged and reported as
 * `unavailable`, and the caller proceeds without a referral.
 */
export async function attributeCheckout(db: AppDb, client: ReferralDiscountsClient, input: AttributeCheckoutInput): Promise<AttributionAttempt> {
  if (!isAffiliatesEnabled()) return { applied: false, reason: "disabled" };
  try {
    return await decideAttribution(db, client, input);
  } catch (error) {
    console.error("referral attribution failed; checkout continues without a referral", {
      error: error instanceof Error ? error.message : "unknown",
      code: error instanceof ReferralError ? error.code : undefined,
    });
    return { applied: false, reason: "unavailable" };
  }
}

interface ReferralCandidate {
  code: string;
  source: AffiliateAttributionSource;
}

type ResolvedReferral = { link: AffiliateLinkRow; affiliate: AffiliateRow; source: AffiliateAttributionSource };

/** The link and affiliate a candidate code refers to, or why it cannot be used for this buyer. */
async function resolveCandidate(db: AppDb, candidate: ReferralCandidate, buyerUserId: string): Promise<ResolvedReferral | ReferralSkipReason> {
  const link = await findActiveLinkByCode(db, candidate.code);
  if (!link) return candidate.source === "code" ? "unknown_code" : "no_referral";
  const affiliate = await findAffiliateById(db, link.affiliateId);
  if (!affiliate || affiliate.status !== "active") return "affiliate_inactive";
  if (affiliate.userId === buyerUserId) return "self_referral";
  try {
    await assertEligibleUser(db, affiliate.userId);
  } catch (error) {
    if (error instanceof ReferralError) return "affiliate_inactive";
    throw error;
  }
  return { link, affiliate, source: candidate.source };
}

/**
 * The explicit code is tried first, then a click cookie inside the attribution window. An explicit
 * code that is unknown or cannot apply (inactive affiliate, self-referral) falls back to a valid
 * cookie; when neither applies, the explicit code's reason is reported.
 */
async function decideAttribution(db: AppDb, client: ReferralDiscountsClient, input: AttributeCheckoutInput): Promise<AttributionAttempt> {
  const now = input.now ?? new Date();
  const { version, rules } = await getActiveRules(db);

  const candidates: ReferralCandidate[] = [];
  if (input.explicitCode) candidates.push({ code: input.explicitCode, source: "code" });
  const cookie = parseAffiliateCookie(input.cookieValue);
  const windowMs = rules.attributionWindowDays * 24 * 60 * 60 * 1000;
  if (cookie && now.getTime() - cookie.clickedAt.getTime() <= windowMs && cookie.clickedAt.getTime() <= now.getTime() + 60_000) {
    candidates.push({ code: cookie.code, source: "cookie" });
  }
  if (candidates.length === 0) return { applied: false, reason: "no_referral" };

  const plan = tierForProductId(input.polarProductId);
  const eligibleIds = eligibleProductIds(rules.eligiblePlans);
  if (!plan || !eligibleIds.includes(input.polarProductId)) return { applied: false, reason: "offer_not_eligible" };

  let resolved: ResolvedReferral | null = null;
  let firstSkip: ReferralSkipReason | null = null;
  for (const candidate of candidates) {
    const outcome = await resolveCandidate(db, candidate, input.buyerUserId);
    if (typeof outcome !== "string") {
      resolved = outcome;
      break;
    }
    firstSkip ??= outcome;
  }
  if (!resolved) return { applied: false, reason: firstSkip ?? "no_referral" };
  const { link, affiliate, source } = resolved;

  try {
    await assertEligibleUser(db, input.buyerUserId);
  } catch (error) {
    if (error instanceof ReferralError) return { applied: false, reason: "buyer_not_eligible" };
    throw error;
  }
  if (await hasPriorMembershipPurchase(db, input.buyerUserId)) return { applied: false, reason: "not_first_purchase" };

  const standing = await affiliateStanding(db, affiliate, now, { version, rules });
  const terms = termsFor(link.discountBps, standing.budgetBps);
  const polarDiscountId = terms.discountBps > 0 ? await ensurePolarDiscount(db, client, terms.discountBps, eligibleIds) : null;

  const [row] = await db
    .insert(affiliateAttributions)
    .values({
      affiliateId: affiliate.id,
      linkId: link.id,
      linkVersion: link.version,
      buyerUserId: input.buyerUserId,
      polarProductId: input.polarProductId,
      source,
      rulesVersion: version,
      level: standing.level.key,
      incentiveBasis: standing.basis,
      budgetBps: terms.budgetBps,
      discountBps: terms.discountBps,
      commissionBps: terms.commissionBps,
      polarDiscountId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ATTRIBUTION_BINDING_TTL_MS),
    })
    .returning({ id: affiliateAttributions.id });
  return { applied: true, attributionId: row.id, polarDiscountId, code: link.code, discountBps: terms.discountBps, source };
}

/** Records the Polar checkout id on the binding (for reconciliation); a no-op when already set. */
export async function attachCheckoutId(db: AppDb, attributionId: string, polarCheckoutId: string): Promise<void> {
  await db
    .update(affiliateAttributions)
    .set({ polarCheckoutId })
    .where(and(eq(affiliateAttributions.id, attributionId), sql`${affiliateAttributions.polarCheckoutId} is null`));
}
