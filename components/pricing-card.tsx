'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import CheckoutButton, { CheckoutError, planName } from '@/components/home/checkout-button';
import { MEMBERSHIP_PRICES, type BillingCycle, type MembershipPlan } from '@/lib/constants/launch';
import type { PlanSeats } from '@/lib/home/membership-seats';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  plan: MembershipPlan;
  billing: BillingCycle;
  who: string;
  features: string[];
  /** null when seat counts are unavailable: the meter is hidden instead of guessed. */
  seats: PlanSeats | null;
  highlighted?: boolean;
  hintId?: string;
}

/** Membership plan card: price for the selected cycle, real seat availability and a direct checkout button. */
export default function PricingCard({ plan, billing, who, features, seats, highlighted = false, hintId }: PricingCardProps) {
  const t = useTranslations('home.pricing');
  const prices = MEMBERSHIP_PRICES[plan];
  const price = prices[billing];
  const saving = prices.quarterly.amount * 4 - prices.annual.amount;
  const source = `pricing-${plan}`;
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

      {seats && (
        <div>
          <p className={cn('text-step-sm', seats.soldOut ? 'text-destructive' : 'text-foreground')}>
            {seats.soldOut ? t('soldOut') : t('seatsLeft', { left: seats.left, total: seats.total })}
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-pill bg-line" aria-hidden="true">
            <div className="h-full rounded-pill bg-primary" style={{ width: `${(seats.taken / Math.max(seats.total, 1)) * 100}%` }} />
          </div>
          <p className="sr-only">{t('seatsMeter', { taken: seats.taken, total: seats.total })}</p>
        </div>
      )}

      <ul className="flex flex-1 flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-step-sm text-ink-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <CheckoutButton
          plan={plan}
          source={source}
          label={t('join', { plan: planName(plan) })}
          hintId={hintId}
          variant={highlighted ? 'default' : 'outline'}
          className="w-full"
        />
        <CheckoutError source={source} />
      </div>
    </article>
  );
}
