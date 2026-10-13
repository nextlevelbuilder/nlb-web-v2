'use client';

import { useTranslations } from 'next-intl';
import { daysUntilWeekday } from '@/lib/home/countdown-schedule';
import { cn } from '@/lib/utils';
import { useNow } from './use-now';

/** "New video every Monday" banner with the real number of days until the next drop (UTC+7). */
export default function CourseDropNotice({ title, className }: { title: string; className?: string }) {
  const t = useTranslations('home.courses');
  const now = useNow();
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 border-l-2 border-primary pl-4', className)}>
      <p className="font-display text-step-xl">{title}</p>
      <p className="text-step-sm text-ink-2">{now === null ? ' ' : t('dropSub', { days: daysUntilWeekday(now) })}</p>
    </div>
  );
}
