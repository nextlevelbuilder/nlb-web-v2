'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * EN · VI segmented control. Switching keeps the current path and query string; next-intl's
 * router also updates the NEXT_LOCALE cookie so detection respects the explicit choice afterwards.
 */
export default function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('shell.language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: Locale) => {
    if (next === locale) return;
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    startTransition(() => {
      router.replace({ pathname, query }, { locale: next, scroll: false });
    });
  };

  return (
    <div role="group" aria-label={t('label')} className={cn('seg', className)} aria-busy={isPending || undefined}>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          className="seg-option px-2.5"
          aria-pressed={option === locale}
          aria-label={t(option)}
          title={t(option)}
          disabled={isPending}
          onClick={() => switchTo(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
