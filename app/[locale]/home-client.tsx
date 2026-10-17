'use client';

import type { ReactNode } from 'react';
import { CheckoutProvider } from '@/components/home/checkout-context';
import ActivityToast from '@/components/constellation/activity-toast';
import HomeEngineClient from '@/components/constellation/home-engine-client';
import OrbitProgress from '@/components/constellation/orbit-progress';
import StickyCta from '@/components/constellation/sticky-cta';
import type { MembershipProductIds } from '@/lib/home/membership-product-ids';
import type { SeatAvailability } from '@/lib/home/membership-seats';
import type { MembershipActivity } from '@/lib/home/recent-membership-activity';

interface HomeClientProps {
  locale: string;
  productIds: MembershipProductIds;
  seats: SeatAvailability | null;
  activity: MembershipActivity[];
  /** Server-rendered chapters (the <main> element). */
  children: ReactNode;
}

/**
 * Client shell for the homepage: shared checkout state, the sky + scroll engine (re-created per
 * locale), the sticky CTA, the activity toast and the orbit progress control.
 */
export default function HomeClient({ locale, productIds, seats, activity, children }: HomeClientProps) {
  return (
    <CheckoutProvider productIds={productIds} seats={seats}>
      <HomeEngineClient key={locale} />
      {children}
      <StickyCta />
      <ActivityToast activity={activity} />
      <OrbitProgress />
    </CheckoutProvider>
  );
}
