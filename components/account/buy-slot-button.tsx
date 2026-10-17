'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { PRODUCT_IDS } from '@/lib/polar';
import { useTranslations } from 'next-intl';

export interface BuySlotButtonProps {
  userEmail?: string;
  className?: string;
}

export default function BuySlotButton({ userEmail, className = '' }: BuySlotButtonProps) {
  const t = useTranslations('account');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD,
          customerEmail: userEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize Polar checkout session.');
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('No checkout URL returned by Polar.');
    } catch (err) {
      console.error('Publishing toolkit checkout failed:', err);
      setError(err instanceof Error && err.message ? err.message : 'Checkout failed.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && (
        <div role="alert" className="flex items-center gap-1 text-step-xs font-medium text-destructive">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="button"
        onClick={handleBuy}
        disabled={loading}
        className={`gap-2 px-6 ${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span>{t('redirectingPolar')}</span>
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('buySlotBtn')}</span>
          </>
        )}
      </Button>
    </div>
  );
}
