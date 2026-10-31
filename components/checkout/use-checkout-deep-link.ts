'use client';

import { useEffect, useState } from 'react';
import type { BillingCycle, MembershipPlan } from '@/lib/constants/launch';

/** Fired by the chat widget when the visitor is already on the home page. */
export const OPEN_CHECKOUT_EVENT = 'nlb:open-checkout';

export interface CheckoutDeepLink {
  plan: MembershipPlan;
  billing: BillingCycle;
  /** Changes on every request, so asking for the same plan twice reopens the dialog. */
  nonce: number;
}

function parse(plan: unknown, billing: unknown): Omit<CheckoutDeepLink, 'nonce'> | null {
  if (plan !== 'premium' && plan !== 'vip') return null;
  return { plan, billing: billing === 'annual' ? 'annual' : 'quarterly' };
}

/**
 * Checkout links (`/?checkout=vip&billing=annual#pricing`, sent by the chat agent or shared) open the
 * existing pre-checkout dialog for that plan, so the visitor still sees the price and accepts the
 * Terms before Polar. The query is removed once read so a reload does not reopen the dialog.
 */
export function useCheckoutDeepLink(): CheckoutDeepLink | null {
  const [request, setRequest] = useState<CheckoutDeepLink | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ plan?: unknown; billing?: unknown }>).detail;
      const parsed = parse(detail?.plan, detail?.billing);
      if (parsed) setRequest({ ...parsed, nonce: Date.now() });
    };
    window.addEventListener(OPEN_CHECKOUT_EVENT, onOpen);

    // A link in the address bar takes the same path as a request from the chat widget.
    const url = new URL(window.location.href);
    const plan = url.searchParams.get('checkout');
    if (plan) {
      const billing = url.searchParams.get('billing');
      url.searchParams.delete('checkout');
      url.searchParams.delete('billing');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new CustomEvent(OPEN_CHECKOUT_EVENT, { detail: { plan, billing } }));
    }
    return () => window.removeEventListener(OPEN_CHECKOUT_EVENT, onOpen);
  }, []);

  return request;
}
