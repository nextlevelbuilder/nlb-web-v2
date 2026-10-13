'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { EARLY_BIRD_DEADLINE_ISO } from '@/lib/constants/launch';
import { countdownParts } from '@/lib/home/countdown-schedule';
import { cn } from '@/lib/utils';
import { useNow } from './use-now';

const DEADLINE = Date.parse(EARLY_BIRD_DEADLINE_ISO);
const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;

/** Early-bird countdown to the fixed deadline in lib/constants/launch.ts. */
export default function EarlyBirdCountdown({ className }: { className?: string }) {
  const t = useTranslations('home.pricing.countdown');
  const format = useFormatter();
  const now = useNow();
  const parts = now === null ? null : countdownParts(DEADLINE, now);
  const date = format.dateTime(DEADLINE, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

  if (parts?.done) {
    return <p className={cn('mono-label text-ink-3', className)}>{t('ended')}</p>;
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-3', className)}>
      <p className="mono-label text-ink-2">{t('label')}</p>
      <div role="timer" aria-label={t('aria', { date })} className="flex gap-2">
        {UNITS.map((unit) => (
          <span key={unit} className="flex min-w-[3.25rem] flex-col items-center rounded-sm border border-line px-2 py-1.5" aria-hidden="true">
            <span className="num-tab font-display text-step-xl leading-none text-foreground">
              {parts ? String(parts[unit]).padStart(2, '0') : '--'}
            </span>
            <span className="mono-label mt-1 text-[10px] text-ink-3">{t(unit)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
