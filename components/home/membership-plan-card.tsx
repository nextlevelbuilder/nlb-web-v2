'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { MEMBERSHIP_PRICES, type BillingCycle, type MembershipPlan } from '@/lib/constants/launch';
import type { PlanSeats } from '@/lib/home/membership-seats';
import { cn } from '@/lib/utils';
import CheckoutButton, { planName } from './checkout-button';
import PlanSeatStatus from './plan-seat-status';

interface MembershipPlanCardProps {
  plan: MembershipPlan;
  billing: BillingCycle;
  who: string;
  features: string[];
  /** null when seat counts are unavailable: seat status is hidden instead of guessed. */
  seats: PlanSeats | null;
  highlighted?: boolean;
}

/** Membership plan card: price for the selected cycle, real seat availability and the pre-checkout CTA. */
export default function MembershipPlanCard({ plan, billing, who, features, seats, highlighted = false }: MembershipPlanCardProps) {
  const t = useTranslations('home.pricing');
  const prices = MEMBERSHIP_PRICES[plan];
  const price = prices[billing];
  const saving = prices.quarterly.amount * 4 - prices.annual.amount;
  const headingId = `plan-${plan}-title`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'relative flex h-full flex-col gap-6 rounded-sm border bg-surface p-6 sm:p-8',
        highlighted ? 'border-primary shadow-glow' : 'border-line',
      )}
    >
      {highlighted && (
        <p className="mono-label absolute -top-3 left-6 rounded-pill bg-primary px-3 py-1 text-primary-foreground">{t('ribbon')}</p>
      )}
      <header>
        <h3 id={headingId} className="font-display text-step-2xl">{planName(plan)}</h3>
        <p className="mono-label mt-1 text-ink-3">{who}</p>
      </header>

      <div>
        <p className="flex items-baseline gap-1">
          <span className="num-tab font-display text-step-3xl leading-none">${price.amount}</span>
          <span className="text-step-sm text-ink-2">{billing === 'annual' ? t('perYear') : t('perQuarter')}</span>
        </p>
        <p className="mt-2 text-step-sm text-ink-2">
          {billing === 'annual'
            ? t('subAnnual', { perMonth: price.perMonth, saving })
            : t('subQuarterly', { perMonth: price.perMonth })}
        </p>
      </div>

      {seats && <PlanSeatStatus seats={seats} />}

      <ul className="flex flex-1 flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-step-sm text-ink-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <CheckoutButton
        plan={plan}
        source={`pricing-${plan}`}
        label={t('join', { plan: planName(plan) })}
        variant={highlighted ? 'default' : 'outline'}
        className="w-full"
      />
    </article>
  );
}
