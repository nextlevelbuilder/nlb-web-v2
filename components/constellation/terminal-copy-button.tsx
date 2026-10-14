'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type CopyState = 'idle' | 'copied' | 'failed';

/** The terminal's text "Copy" pill (`.copy`, `.ok` once copied); the result is announced politely. */
export default function TerminalCopyButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations('home.toolkits');
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const reset = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(reset);
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch (error) {
      console.warn('Clipboard write failed:', error);
      setState('failed');
    }
  };

  return (
    <>
      <button type="button" className={state === 'copied' ? 'copy ok' : 'copy'} onClick={copy} aria-label={label}>
        <span aria-hidden="true">{state === 'copied' ? t('copied') : t('copy')}</span>
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : ''}
      </span>
    </>
  );
}
