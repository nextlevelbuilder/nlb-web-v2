import { getDb, type AppDb } from "@/lib/db";
import { offers, purchases, entitlements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export type AllowedProcessor = "invoice" | "manual" | "polar" | "stripe";

export type OfferCategory =
  | "digital_content"
  | "tooling"
  | "advisory"
  | "community_ancillary"
  | "promotion"
  | "placement"
  | "sponsorship"
  | "traffic";

export const COMPLIANT_OFFER_CATEGORIES: ReadonlySet<OfferCategory> = new Set([
  "digital_content",
  "tooling",
  "advisory",
  "community_ancillary",
]);

export const RESTRICTED_PROMOTIONAL_CATEGORIES: ReadonlySet<OfferCategory> = new Set([
  "promotion",
  "placement",
  "sponsorship",
  "traffic",
]);

export const RESTRICTED_OFFER_SLUGS = [
  "featured-listing",
  "category-sponsor",
  "newsletter-placement",
  "ltd-deal",
  "homepage-feature",
  "sponsored-slot",
  "guaranteed-traffic",
  "paid-article",
] as const;

export interface CreateOfferParams {
  slug: string;
  name: string;
  description?: string;
  category?: OfferCategory;
  allowedProcessors: AllowedProcessor[];
  priceAmount: string;
  priceCurrency?: string;
  isActive?: boolean;
}

/**
 * Enforce Polar AUP Compliance Firewall:
 * Polar processor is strictly permitted ONLY for digital educational content,
 * developer software tooling, structured private advisory, and ancillary community channels.
 * It is categorically prohibited for any promotional placement, sponsorship, or traffic SKUs.
 */
export function validateOfferProcessor(
  slug: string,
  processor: AllowedProcessor,
  category?: OfferCategory
): boolean {
  if (processor === "polar") {
    // 1. Check prohibited promotional categories
    if (category && RESTRICTED_PROMOTIONAL_CATEGORIES.has(category)) {
      return false;
    }

    // 2. Check restricted legacy & promotional slugs
    if ((RESTRICTED_OFFER_SLUGS as readonly string[]).includes(slug)) {
      return false;
    }

    // 3. If category is specified, enforce allowlist (default-deny unknown categories)
    if (category && !COMPLIANT_OFFER_CATEGORIES.has(category)) {
      return false;
    }
  }

  return true;
}

/**
 * On-demand assertion for catalog compliance (safe for Workers isolates, zero boot DB calls).
 */
export function assertOffersCompliance(
  activeOffers: Array<{ slug: string; allowedProcessors: AllowedProcessor[]; category?: OfferCategory }>
): void {
  for (const offer of activeOffers) {
    for (const proc of offer.allowedProcessors) {
      if (!validateOfferProcessor(offer.slug, proc, offer.category)) {
        throw new Error(
          `Catalog compliance violation: offer '${offer.slug}' permits restricted processor '${proc}'.`
        );
      }
    }
  }
}

/**
 * Create a new offer in the catalog with processor validation.
 */
export async function createOffer(params: CreateOfferParams, customDb?: AppDb) {
  const db = customDb || getDb();
  for (const proc of params.allowedProcessors) {
    if (!validateOfferProcessor(params.slug, proc, params.category)) {
      throw new Error(
        `Processor '${proc}' is restricted for offer '${params.slug}' (category: ${params.category || "unspecified"}) under Polar AUP compliance policy.`
      );
    }
  }

  const [offer] = await db
    .insert(offers)
    .values({
      slug: params.slug,
      name: params.name,
      description: params.description,
      allowedProcessors: params.allowedProcessors,
      priceAmount: params.priceAmount,
      priceCurrency: params.priceCurrency || "USD",
      isActive: params.isActive ?? false,
    })
    .returning();

  return offer;
}

/**
 * Mint a purchase intent for an offer.
 */
export async function mintPurchaseIntent(
  {
    userId,
    orgId,
    offerId,
    processor,
  }: {
    userId: string;
    orgId?: string;
    offerId: string;
    processor: AllowedProcessor;
  },
  customDb?: AppDb
) {
  const db = customDb || getDb();
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!offer) {
    throw new Error(`Offer not found: ${offerId}`);
  }

  if (!offer.allowedProcessors.includes(processor)) {
    throw new Error(`Processor '${processor}' not allowed for offer '${offer.slug}'`);
  }

  const intentNonce = `pi_${crypto.randomUUID()}`;

  const [purchase] = await db
    .insert(purchases)
    .values({
      intentNonce,
      userId,
      orgId,
      offerId,
      processor,
      status: "pending",
    })
    .returning();

  return purchase;
}

/**
 * Fulfill a purchase and grant the corresponding entitlement.
 */
export async function fulfillPurchase(
  {
    purchaseId,
    externalReference,
    featureKey,
    validUntil,
  }: {
    purchaseId: string;
    externalReference?: string;
    featureKey: string;
    validUntil?: Date;
  },
  customDb?: AppDb
) {
  const db = customDb || getDb();
  const [purchase] = await db
    .update(purchases)
    .set({
      status: "completed",
      externalReference,
      completedAt: new Date(),
    })
    .where(eq(purchases.id, purchaseId))
    .returning();

  if (!purchase) {
    throw new Error(`Purchase not found: ${purchaseId}`);
  }

  const [entitlement] = await db
    .insert(entitlements)
    .values({
      userId: purchase.userId,
      orgId: purchase.orgId,
      purchaseId: purchase.id,
      featureKey,
      validFrom: new Date(),
      validUntil,
      isActive: true,
    })
    .returning();

  return { purchase, entitlement };
}
