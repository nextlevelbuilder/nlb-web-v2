'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, Sparkles, AlertCircle } from 'lucide-react';
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
    } catch (err: any) {
      setError(err.message || 'Checkout failed.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && (
        <div className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="button"
        onClick={handleBuy}
        disabled={loading}
        className={`rounded-full gap-2 px-6 shadow-lg btn-premium font-bold text-xs ${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('redirectingPolar')}</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{t('buySlotBtn')}</span>
          </>
        )}
      </Button>
    </div>
  );
}
