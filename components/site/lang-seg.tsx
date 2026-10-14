'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';

/**
 * EN · VI segmented control. Switching keeps the current path, query and hash; next-intl's router also
 * stores the NEXT_LOCALE cookie so locale detection respects the explicit choice afterwards.
 */
export default function LangSeg() {
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
    <div className="seg lang-seg" role="group" aria-label={t('label')} aria-busy={isPending || undefined}>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          data-set-lang={option}
          aria-pressed={option === locale}
          aria-label={t(option)}
          disabled={isPending}
          onClick={() => switchTo(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
