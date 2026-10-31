'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_BILLING, DEFAULT_PLAN, MEMBERSHIP_PLANS, type BillingCycle, type MembershipPlan } from '@/lib/constants/launch';
import type { MembershipProductIds } from '@/lib/home/membership-product-ids';
import type { SeatAvailability } from '@/lib/home/membership-seats';

interface CheckoutContextValue {
  productIds: MembershipProductIds;
  /** null when seat counts are unavailable; seat UI is then hidden and checkout stays open. */
  seats: SeatAvailability | null;
  plan: MembershipPlan;
  setPlan: (plan: MembershipPlan) => void;
  billing: BillingCycle;
  setBilling: (billing: BillingCycle) => void;
  /** One shared Terms of Service agreement for every checkout button on the page. */
  agreed: boolean;
  setAgreed: (agreed: boolean) => void;
  /** Which checkout widget started the current attempt, so only that one shows progress/errors. */
  source: string | null;
  pending: boolean;
  failed: boolean;
  isAvailable: (plan: MembershipPlan) => boolean;
  startCheckout: (plan: MembershipPlan, source: string) => Promise<void>;
  /** Affiliate code from the page URL (`?ref=`, added by `/r/<code>`), sent with the checkout request. */
  referralCode: string | null;
  /** Buyer discount the server applied for that code, in basis points, once checkout started. */
  referralAppliedBps: number | null;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

const REFERRAL_CODE_RE = /^[a-z0-9-]{4,32}$/;

/** The `ref` query parameter when it has the shape of a referral code; the server decides the rest. */
export function referralCodeFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('ref')?.trim().toLowerCase() ?? '';
  return REFERRAL_CODE_RE.test(value) ? value : null;
}

function referralAppliedBpsFrom(body: unknown): number | null {
  const referral = body && typeof body === 'object' ? (body as { referral?: { applied?: unknown; discountBps?: unknown } }).referral : undefined;
  return referral?.applied === true && Number.isInteger(referral.discountBps) ? (referral.discountBps as number) : null;
}

function isCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function CheckoutProvider({ productIds, seats, children }: {
  productIds: MembershipProductIds;
  seats: SeatAvailability | null;
  children: ReactNode;
}) {
  const isAvailable = useCallback(
    (plan: MembershipPlan) => Boolean(productIds[plan].quarterly && productIds[plan].annual) && !seats?.[plan].soldOut,
    [productIds, seats],
  );
  const initialPlan = isAvailable(DEFAULT_PLAN) ? DEFAULT_PLAN : MEMBERSHIP_PLANS.find(isAvailable) ?? DEFAULT_PLAN;

  const [plan, setPlan] = useState<MembershipPlan>(initialPlan);
  const [billing, setBilling] = useState<BillingCycle>(DEFAULT_BILLING);
  const [agreed, setAgreed] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralAppliedBps, setReferralAppliedBps] = useState<number | null>(null);

  // Read after hydration so the static page shell stays identical for every visitor.
  useEffect(() => {
    setReferralCode(referralCodeFromSearch(window.location.search));
  }, []);

  // Returning from Polar with the back button restores this page from the bfcache mid-"pending".
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => event.persisted && setPending(false);
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const startCheckout = useCallback(async (target: MembershipPlan, from: string) => {
    if (!agreed || pending || !isAvailable(target)) return;
    setPlan(target);
    setSource(from);
    setFailed(false);
    setPending(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: productIds[target][billing], ...(referralCode ? { referralCode } : {}) }),
      });
      const body: unknown = await response.json().catch(() => null);
      const url = body && typeof body === 'object' ? (body as { url?: unknown }).url : undefined;
      if (!response.ok || !isCheckoutUrl(url)) throw new Error(`Checkout failed with status ${response.status}`);
      setReferralAppliedBps(referralAppliedBpsFrom(body));
      window.location.assign(url);
    } catch (error) {
      console.error('Membership checkout could not start:', error);
      setFailed(true);
      setPending(false);
    }
  }, [agreed, pending, isAvailable, productIds, billing, referralCode]);

  const value = useMemo<CheckoutContextValue>(() => ({
    productIds, seats, plan, setPlan, billing, setBilling, agreed, setAgreed,
    source, pending, failed, isAvailable, startCheckout, referralCode, referralAppliedBps,
  }), [productIds, seats, plan, billing, agreed, source, pending, failed, isAvailable, startCheckout, referralCode, referralAppliedBps]);

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout(): CheckoutContextValue {
  const context = useContext(CheckoutContext);
  if (!context) throw new Error('useCheckout must be used inside <CheckoutProvider>');
  return context;
}
