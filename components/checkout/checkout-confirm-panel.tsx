'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCheckout } from '@/components/home/checkout-context';
import TermsAgreementCheckbox from '@/components/home/terms-agreement-checkbox';
import CheckoutError from './checkout-error';
import { MEMBERSHIP_PLAN_NAMES, MEMBERSHIP_PRICES, type MembershipPlan } from '@/lib/constants/launch';

/**
 * Body of the pre-checkout dialog: the chosen plan and its real price for the selected billing cycle, the
 * Terms agreement, and the button that starts the existing Polar checkout once the Terms are accepted.
 */
export default function CheckoutConfirmPanel({ plan, source }: { plan: MembershipPlan; source: string }) {
  const t = useTranslations('home');
  const { billing, agreed, pending, source: activeSource, isAvailable, startCheckout } = useCheckout();
  const hintId = useId();
  const price = MEMBERSHIP_PRICES[plan][billing];
  const saving = MEMBERSHIP_PRICES[plan].quarterly.amount * 4 - MEMBERSHIP_PRICES[plan].annual.amount;
  const busy = pending && activeSource === source;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-sm border border-line bg-surface p-4">
        <p className="mono-label text-ink-3">{t('checkout.planLabel')}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-step-2xl">{MEMBERSHIP_PLAN_NAMES[plan]}</span>
          <span className="num-tab text-step-lg">
            ${price.amount}
            <span className="text-step-sm text-ink-2">{billing === 'annual' ? t('pricing.perYear') : t('pricing.perQuarter')}</span>
          </span>
        </p>
        <p className="mt-1 text-step-sm text-ink-2">
          {billing === 'annual'
            ? t('pricing.subAnnual', { perMonth: price.perMonth, saving })
            : t('pricing.subQuarterly', { perMonth: price.perMonth })}
        </p>
      </div>

      <TermsAgreementCheckbox hintId={hintId} />

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!agreed || pending || !isAvailable(plan)}
          aria-describedby={hintId}
          onClick={() => startCheckout(plan, source)}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {busy ? t('checkout.processing') : t('checkout.continue')}
        </Button>
        <CheckoutError source={source} />
        <p className="mono-label text-center text-ink-3">{t('pricing.note')}</p>
      </div>
    </div>
  );
}
