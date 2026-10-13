'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ShareProfileButton({ builderName }: { builderName?: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations('builders');

  const handleShare = async () => {
    try {
      if (typeof window !== 'undefined') {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="rounded-full gap-1.5 text-xs border-white/20 hover:bg-white/10"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400 font-semibold">{t('linkCopied')}</span>
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5 text-primary" />
          <span>{t('shareProfile')}</span>
        </>
      )}
    </Button>
  );
}
