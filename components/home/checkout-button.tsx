'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { MembershipPlan } from '@/lib/constants/launch';
import { useCheckout } from './checkout-context';

const PLAN_NAMES: Record<MembershipPlan, string> = { premium: 'Premium', vip: 'VIP' };

export function planName(plan: MembershipPlan) {
  return PLAN_NAMES[plan];
}

interface CheckoutButtonProps extends Pick<ButtonProps, 'size' | 'variant' | 'className'> {
  plan: MembershipPlan;
  /** Unique per widget; scopes progress and error messages to the widget that was used. */
  source: string;
  label: string;
  hintId?: string;
}

/** Starts Polar checkout for `plan` at the selected billing cycle. Disabled until Terms are accepted. */
export default function CheckoutButton({ plan, source, label, hintId, size = 'lg', variant, className }: CheckoutButtonProps) {
  const t = useTranslations('home');
  const { agreed, pending, source: activeSource, isAvailable, startCheckout } = useCheckout();
  const available = isAvailable(plan);
  const busy = pending && activeSource === source;

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      disabled={!agreed || !available || pending}
      aria-describedby={hintId}
      onClick={() => startCheckout(plan, source)}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {busy ? t('checkout.processing') : available ? label : t('pricing.soldOut')}
    </Button>
  );
}

/** Polite status line for the widget identified by `source`. Renders nothing until checkout fails. */
export function CheckoutError({ source }: { source: string }) {
  const t = useTranslations('home.checkout');
  const { failed, source: activeSource } = useCheckout();
  return (
    <p role="status" className="min-h-0 text-step-sm text-destructive empty:hidden">
      {failed && activeSource === source ? t('error') : null}
    </p>
  );
}
