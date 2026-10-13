'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ShareProfileButton() {
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
      // Clipboard access can be denied (permissions, insecure context); the URL stays in the address bar.
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleShare}
      aria-live="polite"
    >
      {copied ? (
        <>
          <Check aria-hidden className="text-success" />
          <span>{t('linkCopied')}</span>
        </>
      ) : (
        <>
          <Share2 aria-hidden className="text-primary" />
          <span>{t('shareProfile')}</span>
        </>
      )}
    </Button>
  );
}
