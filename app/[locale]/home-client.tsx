'use client';

import type { ReactNode } from 'react';
import Navbar from '@/components/navbar';
import ActivityToast from '@/components/home/activity-toast';
import { CheckoutProvider } from '@/components/home/checkout-context';
import StickyCta from '@/components/home/sticky-cta';
import type { MembershipProductIds } from '@/lib/home/membership-product-ids';
import type { SeatAvailability } from '@/lib/home/membership-seats';
import type { MembershipActivity } from '@/lib/home/recent-membership-activity';

interface HomeClientProps {
  productIds: MembershipProductIds;
  seats: SeatAvailability | null;
  activity: MembershipActivity[];
  /** Server-rendered narrative sections. */
  children: ReactNode;
}

function scrollToPricing() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('pricing')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', '#pricing');
}

/** Client shell for the homepage: shared checkout state, header, sticky CTA and the activity feed. */
export default function HomeClient({ productIds, seats, activity, children }: HomeClientProps) {
  return (
    <CheckoutProvider productIds={productIds} seats={seats}>
      <Navbar onScrollToPricing={scrollToPricing} />
      {children}
      <StickyCta />
      <ActivityToast activity={activity} />
    </CheckoutProvider>
  );
}
