'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type UpgradeState = 'idle' | 'loading' | 'upgraded' | 'failed' | 'rate_limited';

/**
 * Premium → VIP on the existing subscription (Polar invoices the difference). Falls back to a
 * new checkout only when the member has no linked Premium subscription to switch.
 */
export default function MembershipUpgradeButton({ productId }: { productId: string }) {
  const t = useTranslations('accountMembership.upgrade');
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<UpgradeState>('idle');

  const checkoutFallback = async () => {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, locale }),
    });
    const data = (await response.json().catch(() => ({}))) as { url?: string };
    if (!response.ok || !data.url) throw new Error('checkout_failed');
    window.location.href = data.url;
  };

  const upgrade = async () => {
    setState('loading');
    try {
      const response = await fetch('/api/onboarding/upgrade', { method: 'POST' });
      if (response.ok) {
        setState('upgraded');
        router.refresh();
        return;
      }
      if (response.status === 429) return setState('rate_limited');
      if (response.status === 409) return await checkoutFallback();
      setState('failed');
    } catch {
      setState('failed');
    }
  };

  if (state === 'upgraded') {
    return (
      <p role="status" className="flex items-center gap-2 text-step-sm text-success">
        <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
        {t('success')}
      </p>
    );
  }

  const loading = state === 'loading';
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button type="button" onClick={upgrade} disabled={loading} className="gap-2">
        {loading ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <ArrowUpRight aria-hidden />}
        {loading ? t('upgrading') : t('cta')}
      </Button>
      {(state === 'failed' || state === 'rate_limited') && (
        <p role="alert" className="text-step-xs text-destructive">
          {t(state === 'failed' ? 'error' : 'rateLimited')}
        </p>
      )}
    </div>
  );
}
