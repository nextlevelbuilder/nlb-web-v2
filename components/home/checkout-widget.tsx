'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MEMBERSHIP_PRICES } from '@/lib/constants/launch';
import { cn } from '@/lib/utils';
import CheckoutButton, { CheckoutError, planName } from './checkout-button';
import { useCheckout } from './checkout-context';
import TermsAgreementCheckbox from './terms-agreement-checkbox';

/**
 * Primary "Join the membership" CTA used by the hero and the finale: goes straight to Polar checkout
 * for the selected plan, gated by the shared Terms of Service checkbox.
 */
export default function CheckoutWidget({ source, className }: { source: string; className?: string }) {
  const t = useTranslations('home');
  const tShell = useTranslations('shell.nav');
  const { plan, billing } = useCheckout();
  const hintId = useId();
  const price = MEMBERSHIP_PRICES[plan][billing].amount;
  const per = billing === 'annual' ? t('pricing.perYear') : t('pricing.perQuarter');

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <CheckoutButton plan={plan} source={source} label={tShell('joinAria')} hintId={hintId} size="xl" />
        <p className="text-step-sm text-ink-2">
          <span className="num-tab">{t('pricing.selected', { plan: planName(plan), price: `$${price}`, per })}</span>
          <span aria-hidden="true"> · </span>
          <Link href={{ pathname: '/', hash: 'pricing' }} className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-primary">
            {t('pricing.changePlan')}
          </Link>
        </p>
      </div>
      <TermsAgreementCheckbox hintId={hintId} />
      <CheckoutError source={source} />
    </div>
  );
}
