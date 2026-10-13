'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const subscribeNever = () => () => {};

const OPTIONS = ['system', 'light', 'dark'] as const;
type ThemeOption = (typeof OPTIONS)[number];

function ThemeIcon({ option }: { option: ThemeOption }) {
  if (option === 'system') {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
        <path d="M8 2a6 6 0 010 12z" fill="currentColor" />
      </svg>
    );
  }
  if (option === 'light') {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" fill="none" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Tri-state theme control (System · Light · Dark). `labelled` shows text labels (mobile menu);
 * otherwise icons with accessible names. Pressed state is only rendered after mount because the
 * stored preference is unknown on the server.
 */
export default function ThemeToggle({ labelled = false, className }: { labelled?: boolean; className?: string }) {
  const t = useTranslations('shell.theme');
  const { theme, setTheme } = useTheme();
  // false during SSR and hydration, true afterwards: the stored preference only exists in the browser.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  return (
    <div role="group" aria-label={t('label')} className={cn('seg', className)}>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={cn('seg-option', labelled && 'px-3 font-sans text-step-sm normal-case tracking-normal')}
          aria-pressed={mounted ? theme === option : undefined}
          aria-label={labelled ? undefined : t(option)}
          title={labelled ? undefined : t(option)}
          onClick={() => setTheme(option)}
        >
          {labelled ? t(option) : <ThemeIcon option={option} />}
        </button>
      ))}
    </div>
  );
}
