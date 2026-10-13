'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useCheckout } from './checkout-context';

const LINK_CLASS = 'text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-primary';

/**
 * Terms of Service + Refund Policy agreement shown in the pre-checkout dialog. The state lives in the
 * checkout context, so a visitor who agreed once is not asked again when switching plans.
 */
export default function TermsAgreementCheckbox({ className, hintId }: { className?: string; hintId?: string }) {
  const t = useTranslations('home.checkout');
  const tShell = useTranslations('shell.footer');
  const { agreed, setAgreed } = useCheckout();
  const id = useId();

  // Policies open in a new tab so the dialog, and the chosen plan, survive reading them.
  const policyLink = (href: '/policies/terms' | '/policies/refund') => function PolicyLink(chunks: ReactNode) {
    return (
      <Link href={href} target="_blank" rel="noopener" className={LINK_CLASS}>
        {chunks}
        <span className="sr-only"> {tShell('newTab')}</span>
      </Link>
    );
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex min-h-[44px] items-center gap-3 text-step-sm text-ink-2">
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="h-5 w-5 shrink-0 cursor-pointer rounded-[4px] border-line-strong accent-[hsl(var(--primary))]"
        />
        <label htmlFor={id} className="cursor-pointer">
          {t.rich('agree', { terms: policyLink('/policies/terms'), refund: policyLink('/policies/refund') })}
        </label>
      </div>
      {hintId && (
        <p id={hintId} className={cn('text-step-xs text-ink-3', agreed && 'sr-only')}>
          {t('hint')}
        </p>
      )}
    </div>
  );
}
