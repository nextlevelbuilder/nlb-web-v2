'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type CopyState = 'idle' | 'copied' | 'failed';

/** Copies `text` to the clipboard and announces the result politely. */
export default function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const t = useTranslations('home.toolkits');
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const reset = setTimeout(() => setState('idle'), 2400);
    return () => clearTimeout(reset);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch (error) {
      console.error('Clipboard write failed:', error);
      setState('failed');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-pill border border-line-strong px-3 font-mono text-step-xs text-ink-2 transition-colors duration-base hover:border-primary hover:text-foreground',
          className,
        )}
      >
        {state === 'copied' ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        <span aria-hidden="true">{state === 'copied' ? t('copied') : t('copy')}</span>
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : ''}
      </span>
    </>
  );
}
