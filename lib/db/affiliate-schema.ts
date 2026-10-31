import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type {
  AffiliateAttributionSource,
  AffiliateAttributionStatus,
  AffiliateConversionStatus,
  AffiliateIncentiveBasis,
  AffiliateLinkStatus,
  AffiliateStatus,
  LedgerBucket,
  LedgerEntryKind,
  PayeeResidency,
  PayeeType,
  PayoutBatchStatus,
  PayoutItemStatus,
  PayoutMethodType,
  ProgramRules,
  VerificationStatus,
} from "@/lib/referrals/types";

/**
 * Referral / affiliate program tables (D1). Decisions live in docs/affiliate-program-adr.md.
 *
 * - Money is integer minor units (cents) of the program currency; rates are integer basis points.
 * - `affiliate_attributions` is the checkout binding: the immutable policy snapshot (level, budget,
 *   discount, commission) a Polar checkout was created with. Later link or rule edits never touch it.
 * - `commission_ledger` is the financial ledger, append-only: no code path issues UPDATE or DELETE.
 *   Each entry moves `amount_minor` from one bucket to another (null = outside the ledger), so the
 *   balance of a bucket is what flowed in minus what flowed out. `idempotency_key` is unique, so a
 *   retried webhook or a concurrent operator can never write the same movement twice.
 * - It is separate from the Builder League points ledger, which is not money.
 * - No raw identity documents are ever stored: `affiliate_verifications` keeps the provider reference
 *   and status only, and payout details are sealed (AES-GCM) with a masked hint for display.
 * User ids are kept without foreign keys so financial history survives account deletion.
 */
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull();
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull();

/** One affiliate account per user, created after accepting a versioned Affiliate Agreement. */
export const affiliates = sqliteTable("affiliates", {
  id: id(),
  userId: text("user_id").notNull().unique(),
  status: text("status").$type<AffiliateStatus>().notNull().default("active"),
  termsVersion: text("terms_version").notNull(),
  termsAcceptedAt: integer("terms_accepted_at", { mode: "timestamp_ms" }).notNull(),
  suspendedReason: text("suspended_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Versioned program rules (tiers, offers, attribution window, hold, payout fees). Rows are never edited. */
export const affiliateProgramRules = sqliteTable("affiliate_program_rules", {
  version: integer("version").primaryKey(),
  rules: text("rules", { mode: "json" }).$type<ProgramRules>().notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

/** An affiliate's referral link: stable code, buyer discount within the tier budget, destination and UTM. */
export const affiliateLinks = sqliteTable(
  "affiliate_links",
  {
    id: id(),
    affiliateId: text("affiliate_id").notNull(),
    /** Lowercase `[a-z0-9-]{4,32}`, unique across the program. */
    code: text("code").notNull().unique(),
    label: text("label"),
    discountBps: integer("discount_bps").notNull().default(0),
    destinationPath: text("destination_path").notNull().default("/"),
    utmCampaign: text("utm_campaign"),
    status: text("status").$type<AffiliateLinkStatus>().notNull().default("active"),
    /** Incremented on every edit; the checkout binding records the version it used. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("affiliate_links_affiliate_idx").on(t.affiliateId, t.status)]
);

/** Unique visitors per link and UTC day. The visitor hash is keyed and day-scoped, never a raw id. */
export const affiliateLinkClicks = sqliteTable(
  "affiliate_link_clicks",
  {
    id: id(),
    linkId: text("link_id").notNull(),
    day: text("day").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("affiliate_link_clicks_unique").on(t.linkId, t.day, t.visitorHash)]
);

/** Polar percentage discounts reused per (basis points, eligible products). */
export const affiliatePolarDiscounts = sqliteTable(
  "affiliate_polar_discounts",
  {
    id: id(),
    discountBps: integer("discount_bps").notNull(),
    productsKey: text("products_key").notNull(),
    polarDiscountId: text("polar_discount_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("affiliate_polar_discounts_unique").on(t.discountBps, t.productsKey)]
);

/** Checkout binding with the immutable policy snapshot. Referenced from Polar metadata `nlb_aff_attr`. */
export const affiliateAttributions = sqliteTable(
  "affiliate_attributions",
  {
    id: id(),
    affiliateId: text("affiliate_id").notNull(),
    linkId: text("link_id").notNull(),
    linkVersion: integer("link_version").notNull(),
    buyerUserId: text("buyer_user_id").notNull(),
    polarProductId: text("polar_product_id").notNull(),
    source: text("source").$type<AffiliateAttributionSource>().notNull(),
    rulesVersion: integer("rules_version").notNull(),
    level: text("level").notNull(),
    incentiveBasis: text("incentive_basis").$type<AffiliateIncentiveBasis>().notNull(),
    budgetBps: integer("budget_bps").notNull(),
    discountBps: integer("discount_bps").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    polarDiscountId: text("polar_discount_id"),
    polarCheckoutId: text("polar_checkout_id"),
    status: text("status").$type<AffiliateAttributionStatus>().notNull().default("pending"),
    createdAt: createdAt(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("affiliate_attributions_buyer_idx").on(t.buyerUserId, t.createdAt)]
);

/**
 * One commission-earning purchase. `buyer_user_id` is unique: a buyer is referred once, ever, which
 * also stops one buyer counting twice for the same affiliate. Amounts are copied from the provider order.
 */
export const affiliateConversions = sqliteTable(
  "affiliate_conversions",
  {
    id: id(),
    attributionId: text("attribution_id").notNull().unique(),
    affiliateId: text("affiliate_id").notNull(),
    buyerUserId: text("buyer_user_id").notNull().unique(),
    polarOrderId: text("polar_order_id").notNull().unique(),
    polarProductId: text("polar_product_id").notNull(),
    currency: text("currency").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    /** Post-discount, pre-tax settled revenue: the commission base. */
    netMinor: integer("net_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    commissionMinor: integer("commission_minor").notNull(),
    /** Net (pre-tax) amount refunded so far, from the latest provider order. */
    refundedNetMinor: integer("refunded_net_minor").notNull().default(0),
    status: text("status").$type<AffiliateConversionStatus>().notNull().default("pending"),
    holdReason: text("hold_reason"),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }).notNull(),
    maturesAt: integer("matures_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("affiliate_conversions_affiliate_idx").on(t.affiliateId, t.status), index("affiliate_conversions_matures_idx").on(t.status, t.maturesAt)]
);

/** Append-only financial ledger (see the module comment). */
export const commissionLedger = sqliteTable(
  "commission_ledger",
  {
    id: id(),
    affiliateId: text("affiliate_id").notNull(),
    conversionId: text("conversion_id"),
    payoutItemId: text("payout_item_id"),
    kind: text("kind").$type<LedgerEntryKind>().notNull(),
    fromBucket: text("from_bucket").$type<LedgerBucket>(),
    toBucket: text("to_bucket").$type<LedgerBucket>(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    actorUserId: text("actor_user_id"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("commission_ledger_affiliate_idx").on(t.affiliateId, t.createdAt), index("commission_ledger_conversion_idx").on(t.conversionId)]
);

/** Where an affiliate is paid. Details are sealed; only a masked hint is readable. */
export const affiliatePayoutMethods = sqliteTable(
  "affiliate_payout_methods",
  {
    id: id(),
    affiliateId: text("affiliate_id").notNull(),
    type: text("type").$type<PayoutMethodType>().notNull(),
    sealedDetails: text("sealed_details").notNull(),
    displayHint: text("display_hint").notNull(),
    payeeType: text("payee_type").$type<PayeeType>().notNull(),
    residency: text("residency").$type<PayeeResidency>().notNull(),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("affiliate_payout_methods_affiliate_idx").on(t.affiliateId, t.status)]
);

/** Monthly manual payout batch for one closed period (`YYYY-MM`). */
export const affiliatePayoutBatches = sqliteTable("affiliate_payout_batches", {
  id: id(),
  period: text("period").notNull().unique(),
  status: text("status").$type<PayoutBatchStatus>().notNull().default("draft"),
  currency: text("currency").notNull(),
  rulesVersion: integer("rules_version").notNull(),
  thresholdMinor: integer("threshold_minor").notNull(),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvalId: text("approval_id"),
  approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const affiliatePayoutItems = sqliteTable(
  "affiliate_payout_items",
  {
    id: id(),
    batchId: text("batch_id").notNull(),
    affiliateId: text("affiliate_id").notNull(),
    payoutMethodId: text("payout_method_id").notNull(),
    methodType: text("method_type").$type<PayoutMethodType>().notNull(),
    grossMinor: integer("gross_minor").notNull(),
    /** NLB payout service fee (disclosed in the Affiliate Agreement), never a provider fee. */
    serviceFeeMinor: integer("service_fee_minor").notNull(),
    /** Tax withheld under the documented rule for this payee; 0 until a rule is approved. */
    withholdingMinor: integer("withholding_minor").notNull(),
    netMinor: integer("net_minor").notNull(),
    status: text("status").$type<PayoutItemStatus>().notNull().default("pending"),
    payoutCurrency: text("payout_currency"),
    /** Decimal string snapshot, e.g. "25410.5" VND per USD. */
    fxRate: text("fx_rate"),
    payoutAmountMinor: integer("payout_amount_minor"),
    providerFeeMinor: integer("provider_fee_minor"),
    externalReference: text("external_reference").unique(),
    paidBy: text("paid_by"),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("affiliate_payout_items_batch_affiliate").on(t.batchId, t.affiliateId)]
);

/** Identity verification outcome from an approved eKYC provider. Never raw documents or OCR payloads. */
export const affiliateVerifications = sqliteTable(
  "affiliate_verifications",
  {
    id: id(),
    affiliateId: text("affiliate_id").notNull(),
    provider: text("provider").notNull(),
    providerReference: text("provider_reference").notNull(),
    status: text("status").$type<VerificationStatus>().notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("affiliate_verifications_affiliate_idx").on(t.affiliateId, t.status)]
);
