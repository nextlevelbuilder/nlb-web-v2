/**
 * Shared types of the referral / affiliate program. Rates are integer basis points (10000 = 100%),
 * money is integer minor units of the program currency. See docs/affiliate-program-adr.md.
 */

export type AffiliateStatus = "active" | "suspended";
export type AffiliateLinkStatus = "active" | "paused" | "archived";
/** `code`: the buyer brought the referral code to checkout; `cookie`: a prior click within the window. */
export type AffiliateAttributionSource = "code" | "cookie";
export type AffiliateAttributionStatus = "pending" | "converted" | "rejected";
/** Which budget column applied: ordinary user, or active paid member (Premium/VIP). */
export type AffiliateIncentiveBasis = "ordinary" | "member";
/**
 * `pending`: inside the refund hold. `available`: matured. `held`: frozen for review (mismatch,
 * dispute). `reversed`: fully refunded or charged back.
 */
export type AffiliateConversionStatus = "pending" | "available" | "held" | "reversed";

/** Ledger buckets: money of one affiliate moves between these (null = outside the ledger). */
export type LedgerBucket = "pending" | "held" | "available" | "payout_locked" | "paid";
export type LedgerEntryKind =
  | "accrual"
  | "maturation"
  | "hold"
  | "release"
  | "reversal"
  | "adjustment"
  | "payout_lock"
  | "payout_unlock"
  | "payout_paid";

export type PayoutMethodType = "paypal" | "bank_vn";
export type PayeeType = "individual" | "business";
export type PayeeResidency = "vn" | "other";
export type PayoutBatchStatus = "draft" | "approved" | "paid" | "cancelled";
export type PayoutItemStatus = "pending" | "paid" | "cancelled";
export type VerificationStatus = "pending" | "verified" | "rejected" | "expired";

export interface ProgramLevel {
  key: string;
  /** Minimum qualifying unique paying customers to reach this level. */
  minCustomers: number;
  ordinaryBudgetBps: number;
  memberBudgetBps: number;
}

export interface ProgramRules {
  currency: string;
  /** Sorted ascending by `minCustomers`; the first level has `minCustomers` 0. */
  levels: ProgramLevel[];
  /** Membership plans whose first settled payment earns commission (MVP: premium, vip). */
  eligiblePlans: Array<"premium" | "vip">;
  attributionWindowDays: number;
  /** Days a commission stays pending before it can be paid (refund window plus margin). */
  holdDays: number;
  payoutThresholdMinor: number;
  /** NLB payout service fee for PayPal payouts (disclosed; not PayPal's own fee). */
  paypalServiceFeeBps: number;
  /** Service fee for Vietnamese bank transfers. Tax withholding is separate and needs an approved rule. */
  bankVnServiceFeeBps: number;
  /** Approved withholding rate per payee class; null = no approved rule, payout blocked for that class. */
  withholding: {
    vnIndividualBps: number | null;
    vnBusinessBps: number | null;
    otherBps: number | null;
  };
  termsVersion: string;
}
