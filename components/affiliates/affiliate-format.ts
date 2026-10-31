/**
 * Display helpers shared by the public affiliate page and the affiliate dashboard. Money arrives as
 * integer minor units and rates as integer basis points (10000 = 100%); both are only formatted here.
 */
import { BPS, maxCommissionBps, previewIncentive, type IncentivePreview } from "@/lib/referrals/program-math";
import type { ProgramLevel } from "@/lib/referrals/types";

export function intlLocale(locale: string): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}

/** `1469` minor units of `usd` → "$14.69" (en) or "14,69 US$" (vi). */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const code = /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: code }).format(minor / 100);
}

/** `1111` bps → "11.11%"; whole percentages drop the decimals ("20%"). */
export function formatBps(bps: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(bps / BPS);
}

export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** "starter" → "Starter": fallback name for a level an operator added after the copy was written. */
export function titleCaseKey(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Share of the way from the current level threshold to the next one, 0-100. */
export function levelProgressPercent(customers: number, currentMin: number, nextMin: number | null): number {
  if (nextMin === null) return 100;
  const span = nextMin - currentMin;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((customers - currentMin) / span) * 100)));
}

export interface BudgetSplitExample {
  levelKey: string;
  budgetBps: number;
  discountBps: number;
  commissionBps: number;
  /** Commission when the whole budget goes to the affiliate (0% discount). */
  zeroDiscountCommissionBps: number;
  preview: IncentivePreview;
}

/**
 * Worked example for the public page: the entry level's member budget, half of it (rounded down to a
 * whole percent) as the buyer discount, on a given list price. Everything comes from the active rules.
 */
export function budgetSplitExample(levels: readonly ProgramLevel[], priceMinor: number): BudgetSplitExample {
  const entry = [...levels].sort((a, b) => a.minCustomers - b.minCustomers)[0];
  const budgetBps = entry.memberBudgetBps;
  const discountBps = Math.floor(budgetBps / 2 / 100) * 100;
  const commissionBps = maxCommissionBps(discountBps, budgetBps);
  return {
    levelKey: entry.key,
    budgetBps,
    discountBps,
    commissionBps,
    zeroDiscountCommissionBps: maxCommissionBps(0, budgetBps),
    preview: previewIncentive(priceMinor, discountBps, commissionBps),
  };
}
