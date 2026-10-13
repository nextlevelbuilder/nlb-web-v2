'use client';

import { useTranslations } from 'next-intl';
import EarlyBirdCountdown from '@/components/home/early-bird-countdown';
import { useCheckout } from '@/components/home/checkout-context';
import MembershipPlanCard from '@/components/home/membership-plan-card';
import SectionPlate from '@/components/home/section-plate';
import PricingPlanSwitcher from '@/components/pricing-plan-switcher';
import { MEMBERSHIP_PRICES } from '@/lib/constants/launch';

const PREMIUM_FEATURES = ['p1', 'p2', 'p3', 'p4'] as const;
const VIP_FEATURES = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'] as const;

/** Smallest annual saving across plans, so the "Save N%" badge never overstates. */
const ANNUAL_SAVING_PERCENT = Math.floor(
  Math.min(
    ...Object.values(MEMBERSHIP_PRICES).map(({ quarterly, annual }) => (1 - annual.amount / (quarterly.amount * 4)) * 100),
  ),
);

/** Chapter VI · Join: early-bird countdown, billing toggle, real seat counts and the pre-checkout dialog. */
export default function PricingSection() {
  const t = useTranslations('home.pricing');
  const { billing, setBilling, seats } = useCheckout();

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="section-pad">
      <div className="wrap">
        <SectionPlate numeral="VI" name={t('plate')} />
        <h2 id="pricing-title" className="h-section max-w-[18ch]">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>

        <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <EarlyBirdCountdown />
          <PricingPlanSwitcher
            value={billing}
            onChange={setBilling}
            label={t('period')}
            options={{ quarterly: t('quarterly'), annual: t('annual') }}
            annualNote={`−${ANNUAL_SAVING_PERCENT}%`}
            className="self-start"
          />
        </div>
        <p className="sr-only" aria-live="polite">{billing === 'annual' ? t('save', { percent: ANNUAL_SAVING_PERCENT }) : ''}</p>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <MembershipPlanCard
            plan="premium"
            billing={billing}
            who={t('premiumWho')}
            features={PREMIUM_FEATURES.map((key) => t(key))}
            seats={seats?.premium ?? null}
          />
          <MembershipPlanCard
            plan="vip"
            billing={billing}
            who={t('vipWho')}
            features={VIP_FEATURES.map((key) => t(key))}
            seats={seats?.vip ?? null}
            highlighted
          />
        </div>

        <p className="mono-label mt-8 text-ink-3">{t('note')}</p>
      </div>
    </section>
  );
}
