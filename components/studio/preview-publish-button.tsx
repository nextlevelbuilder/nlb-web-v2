'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface PreviewPublishButtonProps {
  slug: string;
  status: string;
}

export default function PreviewPublishButton({
  slug,
  status,
}: PreviewPublishButtonProps) {
  const t = useTranslations('preview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  if (status === 'published') {
    return (
      <div className="flex items-center gap-2 font-mono text-step-xs text-success">
        <CheckCircle2 aria-hidden className="w-4 h-4" />
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
        setSuccess('Redirecting to Polar checkout…');
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
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'An error occurred while submitting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div aria-live="polite" className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
      {error && (
        <div role="alert" className="text-step-xs text-destructive flex items-center gap-1">
          <AlertCircle aria-hidden className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="text-step-xs text-success flex items-center gap-1">
          <CheckCircle2 aria-hidden className="w-3.5 h-3.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <Button
        type="button"
        onClick={handlePublish}
        disabled={loading}
        size="sm"
        className="gap-2 shrink-0"
      >
        {loading ? (
          <>
            <Loader2 aria-hidden className="w-3.5 h-3.5 animate-spin" />
            <span>{t('submitting')}</span>
          </>
        ) : (
          <>
            <Send aria-hidden className="w-3.5 h-3.5" />
            <span>{t('publishBtn')}</span>
          </>
        )}
      </Button>
    </div>
  );
}
