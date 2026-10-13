'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useCheckout } from './checkout-context';

/**
 * Inline Terms of Service agreement. Every instance on the page shares one state, so ticking it in the
 * hero also enables checkout in pricing and the finale.
 */
export default function TermsAgreementCheckbox({ className, hintId }: { className?: string; hintId?: string }) {
  const t = useTranslations('home.checkout');
  const tShell = useTranslations('shell.footer');
  const { agreed, setAgreed } = useCheckout();
  const id = useId();

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-step-sm text-ink-2">
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          aria-describedby={hintId}
          className="h-5 w-5 shrink-0 cursor-pointer rounded-[4px] border-line-strong accent-[hsl(var(--primary))]"
        />
        <span>
          {t.rich('agree', {
            terms: (chunks) => (
              <Link href="/policies/terms" target="_blank" rel="noopener" className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-primary">
                {chunks}
                <span className="sr-only"> {tShell('newTab')}</span>
              </Link>
            ),
          })}
        </span>
      </label>
      {hintId && (
        <p id={hintId} className={cn('text-step-xs text-ink-3', agreed && 'sr-only')}>
          {t('hint')}
        </p>
      )}
    </div>
  );
}
