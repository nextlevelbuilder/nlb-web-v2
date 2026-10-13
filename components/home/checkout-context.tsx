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
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

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
        body: JSON.stringify({ productId: productIds[target][billing] }),
      });
      const body: unknown = await response.json().catch(() => null);
      const url = body && typeof body === 'object' ? (body as { url?: unknown }).url : undefined;
      if (!response.ok || !isCheckoutUrl(url)) throw new Error(`Checkout failed with status ${response.status}`);
      window.location.assign(url);
    } catch (error) {
      console.error('Membership checkout could not start:', error);
      setFailed(true);
      setPending(false);
    }
  }, [agreed, pending, isAvailable, productIds, billing]);

  const value = useMemo<CheckoutContextValue>(() => ({
    productIds, seats, plan, setPlan, billing, setBilling, agreed, setAgreed,
    source, pending, failed, isAvailable, startCheckout,
  }), [productIds, seats, plan, billing, agreed, source, pending, failed, isAvailable, startCheckout]);

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout(): CheckoutContextValue {
  const context = useContext(CheckoutContext);
  if (!context) throw new Error('useCheckout must be used inside <CheckoutProvider>');
  return context;
}
