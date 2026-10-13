import { Polar } from "@polar-sh/sdk";
import { env } from "./env";

export const polar = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
});

export const PRODUCT_IDS = {
  // Premium Package (Self-paced Builder)
  PREMIUM_QUARTERLY: env.POLAR_PRODUCT_PREMIUM_QUARTERLY,
  PREMIUM_ANNUAL: env.POLAR_PRODUCT_PREMIUM_ANNUAL,

  // VIP Package (Guided Builder)
  VIP_QUARTERLY: env.POLAR_PRODUCT_VIP_QUARTERLY,
  VIP_ANNUAL: env.POLAR_PRODUCT_VIP_ANNUAL,

  // Publishing Studio Toolkit (Developer Software)
  PUBLISHING_TOOLKIT_EARLY_BIRD: env.POLAR_PRODUCT_DIRECTORY_EARLY_BIRD,
  PUBLISHING_TOOLKIT_STANDARD: env.POLAR_PRODUCT_DIRECTORY_STANDARD,
  // Backward-compatibility symbol aliases
  DIRECTORY_EARLY_BIRD: env.POLAR_PRODUCT_DIRECTORY_EARLY_BIRD,
  DIRECTORY_STANDARD: env.POLAR_PRODUCT_DIRECTORY_STANDARD,
} as const;

export type ProductId = typeof PRODUCT_IDS[keyof typeof PRODUCT_IDS];

// Membership & Community Subscriptions (Recurring)
export const MEMBERSHIP_PRODUCT_IDS = new Set<string>([
  PRODUCT_IDS.PREMIUM_QUARTERLY,
  PRODUCT_IDS.PREMIUM_ANNUAL,
  PRODUCT_IDS.VIP_QUARTERLY,
  PRODUCT_IDS.VIP_ANNUAL,
]);

// Membership plans mapped to their recurring Polar product ids (every billing interval of a plan).
export type MembershipPlan = "premium" | "vip";
export const MEMBERSHIP_PLAN_PRODUCT_IDS: Readonly<Record<MembershipPlan, readonly string[]>> = {
  premium: [PRODUCT_IDS.PREMIUM_QUARTERLY, PRODUCT_IDS.PREMIUM_ANNUAL],
  vip: [PRODUCT_IDS.VIP_QUARTERLY, PRODUCT_IDS.VIP_ANNUAL],
};

/** Polar product ids for every billing interval of the given membership plans. */
export function productIdsForPlans(plans: readonly MembershipPlan[]): string[] {
  return [...new Set(plans.flatMap((plan) => MEMBERSHIP_PLAN_PRODUCT_IDS[plan]))];
}

// Publishing Studio Toolkit (One-time developer software licenses)
export const PUBLISHING_PRODUCT_IDS = new Set<string>([
  PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD,
  PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD,
]);
export const DIRECTORY_PRODUCT_IDS = PUBLISHING_PRODUCT_IDS;

// Boot-time disjointness and completeness assertion
const intersection = [...MEMBERSHIP_PRODUCT_IDS].filter((id) => PUBLISHING_PRODUCT_IDS.has(id));
if (intersection.length > 0) {
  throw new Error(`Polar product classification mismatch: overlapping IDs [${intersection.join(", ")}]`);
}

// Allowlist of product IDs that belong to THIS website (nextlevelbuilder.io)
// Derived as the union of all classified product lines
export const ALLOWED_PRODUCT_IDS = new Set<string>([
  ...MEMBERSHIP_PRODUCT_IDS,
  ...PUBLISHING_PRODUCT_IDS,
]);

/**
 * Check if a product ID belongs to this website
 */
export function isOurProduct(productId: string | undefined | null): boolean {
  if (!productId) return false;
  return ALLOWED_PRODUCT_IDS.has(productId);
}

/**
 * Check if a product ID belongs to the Private Premium Discord Community
 */
export function isMembershipProduct(productId: string | undefined | null): boolean {
  if (!productId) return false;
  return MEMBERSHIP_PRODUCT_IDS.has(productId);
}

/**
 * Check if a product ID belongs to Publishing Studio Toolkit Submissions
 */
export function isPublishingProduct(productId: string | undefined | null): boolean {
  if (!productId) return false;
  return PUBLISHING_PRODUCT_IDS.has(productId);
}
export const isDirectoryProduct = isPublishingProduct;

/**
 * Extract product IDs from webhook event data
 * Returns array of product IDs found in the event
 */
export function extractProductIdsFromEvent(event: any): string[] {
  const productIds: string[] = [];
  const data = event?.data;

  if (!data) return productIds;

  // Direct product_id field (subscriptions, orders)
  if (data.product_id) {
    productIds.push(data.product_id);
  }

  // Product object with id (subscriptions, orders)
  if (data.product?.id) {
    productIds.push(data.product.id);
  }

  // Checkout events - can have multiple products
  if (data.products && Array.isArray(data.products)) {
    data.products.forEach((p: any) => {
      if (p.product_id) productIds.push(p.product_id);
      if (p.id) productIds.push(p.id);
    });
  }

  // Checkout items
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item: any) => {
      if (item.product_id) productIds.push(item.product_id);
      if (item.product?.id) productIds.push(item.product.id);
    });
  }

  return [...new Set(productIds)]; // Remove duplicates
}

export async function createCheckoutSession(
  productId: ProductId,
  customerEmail?: string,
  productSlug?: string
) {
  try {
    // Validate product ID before making API call
    if (!productId || typeof productId !== "string") {
      throw new Error("Invalid product ID provided");
    }

    // Success redirect URL
    const successUrl = productSlug
      ? `${env.NEXT_PUBLIC_APP_URL}/studio/products/${productSlug}/preview?payment=success&session_id={CHECKOUT_ID}`
      : `${env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_ID}`;

    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl,
      customerEmail,
      metadata: {
        ...(productSlug ? { productSlug } : {}),
        productCategory: isPublishingProduct(productId) ? "developer_tooling" : "education_advisory",
        exposureGuaranteed: "false",
      },
    });
    console.log("Checkout session created successfully:", {
      checkoutId: checkout.id,
      hasUrl: !!checkout.url,
    });

    return checkout;
  } catch (error) {
    // Add context to error before re-throwing
    console.error("Failed to create checkout session:", {
      productId,
      customerEmail: customerEmail ? "[REDACTED]" : undefined,
      error: error instanceof Error ? error.message : error,
    });

    throw error;
  }
}
