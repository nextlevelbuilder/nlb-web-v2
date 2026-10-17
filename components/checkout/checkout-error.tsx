'use client';

import { useTranslations } from 'next-intl';
import { useCheckout } from '@/components/home/checkout-context';

/** Polite status line for the widget identified by `source`. Renders nothing until checkout fails. */
export default function CheckoutError({ source }: { source: string }) {
  const t = useTranslations('home.checkout');
  const { failed, source: activeSource } = useCheckout();
  return (
    <p role="status" className="min-h-0 text-step-sm text-destructive empty:hidden">
      {failed && activeSource === source ? t('error') : null}
    </p>
  );
}
