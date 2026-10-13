'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useTransition } from 'react';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const switchLanguage = (newLocale: string) => {
    if (newLocale === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: newLocale });
    });
  };

  return (
    <div className="flex items-center rounded-full bg-white/[0.04] border border-white/10 p-0.5 text-xs font-mono shrink-0">
      <button
        type="button"
        onClick={() => switchLanguage('vi')}
        disabled={isPending}
        title="Tiếng Việt"
        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
          locale === 'vi'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => switchLanguage('en')}
        disabled={isPending}
        title="English"
        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
          locale === 'en'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}
