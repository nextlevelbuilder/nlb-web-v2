/**
 * Pure incentive math of the affiliate program. Everything is integer: rates in basis points
 * (10000 = 100%), money in minor units. Rounding rules (see docs/affiliate-program-adr.md):
 * - the buyer discount is computed by Polar from the discount's basis points; we only verify it;
 * - commission = floor(net * c / 10000): fractions of a cent stay with the merchant;
 * - reversals are proportional to the net refunded and rounded up, capped at the commission, so a
 *   full refund always reverses the whole commission and partial refunds never under-reverse.
 */
import type { AffiliateIncentiveBasis, ProgramLevel, ProgramRules } from "./types";

export const BPS = 10_000;

/** The level reached with `customers` qualifying unique paying customers. */
export function levelFor(rules: Pick<ProgramRules, "levels">, customers: number): ProgramLevel {
  const sorted = [...rules.levels].sort((a, b) => a.minCustomers - b.minCustomers);
  let current = sorted[0];
  for (const level of sorted) if (customers >= level.minCustomers) current = level;
  return current;
}

/** The next level and how many more customers it needs, or null at the top. */
export function nextLevel(rules: Pick<ProgramRules, "levels">, customers: number): { level: ProgramLevel; customersNeeded: number } | null {
  const next = [...rules.levels].sort((a, b) => a.minCustomers - b.minCustomers).find((level) => level.minCustomers > customers);
  return next ? { level: next, customersNeeded: next.minCustomers - customers } : null;
}

export function budgetFor(level: ProgramLevel, basis: AffiliateIncentiveBasis): number {
  return basis === "member" ? level.memberBudgetBps : level.ordinaryBudgetBps;
}

/** `d + (1-d)*c <= B`, checked exactly in integers: `d*10000 + (10000-d)*c <= B*10000`. */
export function withinBudget(discountBps: number, commissionBps: number, budgetBps: number): boolean {
  if (![discountBps, commissionBps, budgetBps].every(Number.isInteger)) return false;
  if (discountBps < 0 || commissionBps < 0 || budgetBps < 0 || discountBps >= BPS || commissionBps > BPS) return false;
  return discountBps * BPS + (BPS - discountBps) * commissionBps <= budgetBps * BPS;
}

/** Largest commission that keeps `(d, c)` within budget `B`: floor((B-d)*10000/(10000-d)); 0 when d >= B. */
export function maxCommissionBps(discountBps: number, budgetBps: number): number {
  if (discountBps >= budgetBps) return 0;
  return Math.floor(((budgetBps - discountBps) * BPS) / (BPS - discountBps));
}

export interface IncentiveTerms {
  budgetBps: number;
  discountBps: number;
  commissionBps: number;
  /** True when the requested discount exceeded the budget and was lowered to it. */
  discountClamped: boolean;
}

/**
 * Terms for a checkout: the link's discount, clamped to the current budget (an affiliate whose
 * membership ended keeps the link, but the discount can no longer exceed the ordinary budget), and
 * the largest commission the rest of the budget allows.
 */
export function termsFor(requestedDiscountBps: number, budgetBps: number): IncentiveTerms {
  const discountBps = Math.max(0, Math.min(requestedDiscountBps, budgetBps));
  const commissionBps = maxCommissionBps(discountBps, budgetBps);
  return { budgetBps, discountBps, commissionBps, discountClamped: discountBps !== requestedDiscountBps };
}

export function commissionMinor(netMinor: number, commissionBps: number): number {
  if (netMinor <= 0 || commissionBps <= 0) return 0;
  return Math.floor((netMinor * commissionBps) / BPS);
}

/** Total commission that must be reversed once `refundedNetMinor` of `netMinor` was refunded. */
export function reversalTarget(commission: number, netMinor: number, refundedNetMinor: number): number {
  if (commission <= 0 || refundedNetMinor <= 0) return 0;
  if (netMinor <= 0 || refundedNetMinor >= netMinor) return commission;
  return Math.min(commission, Math.ceil((commission * refundedNetMinor) / netMinor));
}

export interface IncentivePreview {
  priceMinor: number;
  discountMinor: number;
  buyerPaysMinor: number;
  commissionMinor: number;
  merchantKeepsMinor: number;
}

/**
 * Preview for a pre-tax price `P`: what the buyer pays, what the affiliate earns and what NLB keeps.
 * The discount uses round-half-up like Polar; the result is indicative, the order decides.
 */
export function previewIncentive(priceMinor: number, discountBps: number, commissionBps: number): IncentivePreview {
  const discountMinor = Math.min(priceMinor, Math.round((priceMinor * discountBps) / BPS));
  const buyerPaysMinor = priceMinor - discountMinor;
  const commission = commissionMinor(buyerPaysMinor, commissionBps);
  return { priceMinor, discountMinor, buyerPaysMinor, commissionMinor: commission, merchantKeepsMinor: buyerPaysMinor - commission };
}

export interface PayoutAmounts {
  grossMinor: number;
  serviceFeeMinor: number;
  withholdingMinor: number;
  netMinor: number;
}

/** Fee and withholding are each floored on the gross; the payee receives the rest. */
export function payoutAmounts(grossMinor: number, serviceFeeBps: number, withholdingBps: number): PayoutAmounts {
  const serviceFeeMinor = Math.floor((grossMinor * serviceFeeBps) / BPS);
  const withholdingMinor = Math.floor((grossMinor * withholdingBps) / BPS);
  return { grossMinor, serviceFeeMinor, withholdingMinor, netMinor: grossMinor - serviceFeeMinor - withholdingMinor };
}
