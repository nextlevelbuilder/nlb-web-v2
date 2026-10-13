'use client';

import { useTranslations } from 'next-intl';
import type { PlanSeats } from '@/lib/home/membership-seats';
import { seatStatus } from '@/lib/home/seat-meter';
import { cn } from '@/lib/utils';

/**
 * Real seat availability for one plan. The "N of M seats left" meter appears only once half the seats are
 * taken; before that the cap is shown as exclusivity ("Limited to M members").
 */
export default function PlanSeatStatus({ seats }: { seats: PlanSeats }) {
  const t = useTranslations('home.pricing');
  const status = seatStatus(seats);

  if (status === 'cap') {
    return <p className="text-step-sm text-foreground">{t('limited', { total: seats.total })}</p>;
  }

  return (
    <div>
      <p className={cn('text-step-sm', status === 'soldOut' ? 'text-destructive' : 'text-foreground')}>
        {status === 'soldOut' ? t('soldOut') : t('seatsLeft', { left: seats.left, total: seats.total })}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-pill bg-line" aria-hidden="true">
        <div className="h-full rounded-pill bg-primary" style={{ width: `${(seats.taken / Math.max(seats.total, 1)) * 100}%` }} />
      </div>
      <p className="sr-only">{t('seatsMeter', { taken: seats.taken, total: seats.total })}</p>
    </div>
  );
}
