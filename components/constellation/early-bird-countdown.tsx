'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { EARLY_BIRD_DEADLINE_ISO } from '@/lib/constants/launch';
import { countdownParts } from '@/lib/home/countdown-schedule';
import { useNow } from '@/components/home/use-now';

const DEADLINE = Date.parse(EARLY_BIRD_DEADLINE_ISO);
const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;

/** Early-bird countdown (Constellation `.countdown` tiles) to the fixed deadline in lib/constants/launch.ts. */
export default function EarlyBirdCountdown() {
  const t = useTranslations('home.pricing.countdown');
  const format = useFormatter();
  const now = useNow();
  const parts = now === null ? null : countdownParts(DEADLINE, now);
  const date = format.dateTime(DEADLINE, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

  return (
    <div className="countdown" role="timer" aria-label={parts?.done ? t('ended') : t('aria', { date })}>
      <span className="cd-label mono">{parts?.done ? t('ended') : t('label')}</span>
      <div className="cd" aria-hidden="true">
        {UNITS.map((unit) => (
          <div key={unit}>
            <b>{parts ? String(parts[unit]).padStart(2, '0') : '--'}</b>
            <span className="mono">{t(unit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
