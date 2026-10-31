import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import type { ReferralDiscountsClient } from "@/lib/referrals/affiliate-checkout";
import { createLink } from "@/lib/referrals/affiliate-links";
import { enrollAffiliate, type AffiliateRow } from "@/lib/referrals/affiliates";
import { AFFILIATE_TERMS_VERSION } from "@/lib/referrals/program-rules";
import type { PolarOrderForReferral } from "@/lib/referrals/affiliate-conversions";

/** Shared seeds for the referral domain tests (each test file runs on its own in-memory D1). */
let seq = 0;
export const nextSeq = () => ++seq;
export const DAY = 24 * 60 * 60 * 1000;
export const TEST_ENCRYPTION_KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));

export async function seedUser(prefix = "ref", { verified = true, banned = false } = {}): Promise<{ id: string; email: string }> {
  const n = nextSeq();
  const id = `${prefix}-${n}`;
  const email = `${prefix}${n}@example.com`;
  await getDb().insert(users).values({ id, name: `${prefix} ${n}`, email, emailVerified: verified, banned });
  return { id, email };
}

export async function seedAffiliate(prefix = "aff"): Promise<{ user: { id: string; email: string }; affiliate: AffiliateRow }> {
  const user = await seedUser(prefix);
  const affiliate = await enrollAffiliate(getDb(), user.id, { termsVersion: AFFILIATE_TERMS_VERSION });
  return { user, affiliate };
}

export async function seedAffiliateWithLink(discountBps = 500, code?: string) {
  const { user, affiliate } = await seedAffiliate();
  const link = await createLink(getDb(), affiliate, { code: code ?? `link-${nextSeq()}`, discountBps });
  return { user, affiliate, link };
}

/** Fake Polar discounts client that records each create call. */
export function fakeDiscounts(): ReferralDiscountsClient & { calls: number } {
  const client = {
    calls: 0,
    discounts: {
      create: async () => {
        client.calls++;
        return { id: `polar-discount-${client.calls}` };
      },
    },
  };
  return client as unknown as ReferralDiscountsClient & { calls: number };
}

export const PREMIUM = PRODUCT_IDS.PREMIUM_ANNUAL;
export const TOOLKIT = PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD;

/** A settled first membership order that matches the attribution snapshot. */
export function paidOrder(input: {
  orderId: string;
  attributionId: string;
  buyerUserId: string;
  discountId: string | null;
  productId?: string;
  net?: number;
  discount?: number;
  createdAt?: Date;
  billingReason?: string;
  refunded?: number;
}): PolarOrderForReferral {
  const net = input.net ?? 10_000;
  const discount = input.discount ?? 0;
  return {
    id: input.orderId,
    status: input.refunded ? (input.refunded >= net ? "refunded" : "partially_refunded") : "paid",
    paid: true,
    billing_reason: input.billingReason ?? "subscription_create",
    product_id: input.productId ?? PREMIUM,
    discount_id: input.discountId,
    currency: "usd",
    subtotal_amount: net + discount,
    discount_amount: discount,
    net_amount: net,
    tax_amount: 0,
    refunded_amount: input.refunded ?? 0,
    refunded_tax_amount: 0,
    created_at: (input.createdAt ?? new Date()).toISOString(),
    metadata: { nlb_aff_attr: input.attributionId, nlb_user_id: input.buyerUserId },
  };
}
