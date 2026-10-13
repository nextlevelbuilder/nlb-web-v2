'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface PreviewPublishButtonProps {
  slug: string;
  status: string;
  isEarlyBird?: boolean;
}

export default function PreviewPublishButton({
  slug,
  status,
  isEarlyBird = true,
}: PreviewPublishButtonProps) {
  const t = useTranslations('preview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  if (status === 'published') {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 font-mono">
        <CheckCircle2 className="w-4 h-4" />
        <span>{t('listingLive')}</span>
      </div>
    );
  }

  const handlePublish = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/v1/products/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFastTrack: false }),
      });

      const data = await res.json();

      if (res.status === 402 && data.checkoutUrl) {
        setSuccess('Redirecting to Polar checkout to activate slot...');
        window.location.href = data.checkoutUrl;
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to publish product.');
      }

      setSuccess(t('submittedSuccess'));
      setTimeout(() => {
        router.refresh();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
      {error && (
        <div className="text-[11px] text-rose-400 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="text-[11px] text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{success}</span>
        </div>
      )}

      <Button
        type="button"
        onClick={handlePublish}
        disabled={loading}
        className="rounded-full gap-2 px-6 shadow-lg btn-premium font-bold text-xs shrink-0"
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('submitting')}</span>
          </>
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            <span>{t('publishBtn')}</span>
          </>
        )}
      </Button>
    </div>
  );
}
