'use client';

import { useTranslations } from 'next-intl';
import { Button, type ButtonProps } from '@/components/ui/button';
import CheckoutConfirmDialog from '@/components/checkout/checkout-confirm-dialog';
import { MEMBERSHIP_PLAN_NAMES, type MembershipPlan } from '@/lib/constants/launch';
import { useCheckout } from './checkout-context';

export { default as CheckoutError } from '@/components/checkout/checkout-error';

export function planName(plan: MembershipPlan) {
  return MEMBERSHIP_PLAN_NAMES[plan];
}

interface CheckoutButtonProps extends Pick<ButtonProps, 'size' | 'variant' | 'className'> {
  plan: MembershipPlan;
  /** Unique per widget; scopes progress and error messages to the widget that was used. */
  source: string;
  label: string;
  /** Optional id of text describing the CTA (announced with the button). */
  hintId?: string;
}

/**
 * Membership CTA. Always enabled while the plan has seats; it opens the pre-checkout dialog, where the
 * visitor accepts the Terms and continues to Polar checkout.
 */
export default function CheckoutButton({ plan, source, label, hintId, size = 'lg', variant, className }: CheckoutButtonProps) {
  const t = useTranslations('home.pricing');
  const { isAvailable } = useCheckout();
  const available = isAvailable(plan);

  if (!available) {
    return (
      <Button type="button" size={size} variant={variant} className={className} aria-describedby={hintId} disabled>
        {t('soldOut')}
      </Button>
    );
  }

  return (
    <CheckoutConfirmDialog plan={plan} source={source}>
      <Button type="button" size={size} variant={variant} className={className} aria-describedby={hintId}>
        {label}
      </Button>
    </CheckoutConfirmDialog>
  );
}
