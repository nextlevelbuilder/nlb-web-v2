'use client';

import { useTranslations } from 'next-intl';
import { daysUntilWeekday } from '@/lib/home/countdown-schedule';
import { useNow } from '@/components/home/use-now';

/** "New video drops Monday" with the real days until the next weekly drop (UTC+7). */
export default function CourseDrop() {
  const t = useTranslations('home.courses');
  const now = useNow();
  const days = now === null ? null : daysUntilWeekday(now);
  return (
    <div className="drop">
      <span className="pulse" aria-hidden="true" />
      <div>
        <strong>{days === 0 ? t('dropToday') : t('dropMonday')}</strong>
        <span>{days === null ? ' ' : t('dropSub', { days })}</span>
      </div>
    </div>
  );
}
