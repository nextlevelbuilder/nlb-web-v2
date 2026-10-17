'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Premium → VIP through the existing Polar checkout (same flow as the pricing cards). */
export default function MembershipUpgradeButton({ productId }: { productId: string }) {
  const t = useTranslations('accountMembership.upgrade');
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const upgrade = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, locale }),
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (!response.ok || !data.url) throw new Error('checkout_failed');
      window.location.href = data.url;
    } catch {
      setFailed(true);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button type="button" onClick={upgrade} disabled={loading} className="gap-2">
        {loading ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <ArrowUpRight aria-hidden />}
        {loading ? t('redirecting') : t('cta')}
      </Button>
      {failed && (
        <p role="alert" className="text-step-xs text-destructive">
          {t('error')}
        </p>
      )}
    </div>
  );
}
