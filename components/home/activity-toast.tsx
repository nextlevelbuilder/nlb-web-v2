'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { MembershipActivity } from '@/lib/home/recent-membership-activity';
import { planName } from './checkout-button';

const FIRST_DELAY_MS = 9000;
const VISIBLE_MS = 6500;
const GAP_MIN_MS = 12000;
const GAP_RANGE_MS = 8000;

function useRelativeTime() {
  const t = useTranslations('home.activity');
  return (occurredAt: number, now: number) => {
    const minutes = Math.max(1, Math.round((now - occurredAt) / 60000));
    if (minutes < 60) return t('minutesAgo', { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t('hoursAgo', { count: hours });
    return t('daysAgo', { count: Math.round(hours / 24) });
  };
}

/**
 * Low-frequency toasts of real recent membership joins (first name or anonymised). Renders nothing
 * when there are no events or when the visitor prefers reduced motion. One toast at a time, paused on
 * hover or focus, and dismissing it stops the feed for this visit.
 */
export default function ActivityToast({ activity }: { activity: MembershipActivity[] }) {
  const t = useTranslations('home.activity');
  const relative = useRelativeTime();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [shownAt, setShownAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const enabled = activity.length > 0 && reduceMotion === false && !dismissed;

  useEffect(() => {
    if (!enabled || paused) return;
    const delay = visible ? VISIBLE_MS : index < 0 ? FIRST_DELAY_MS : GAP_MIN_MS + Math.random() * GAP_RANGE_MS;
    const timer = setTimeout(() => {
      if (visible) {
        setVisible(false);
      } else {
        setIndex((current) => (current + 1) % activity.length);
        setShownAt(Date.now());
        setVisible(true);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [enabled, paused, visible, index, activity.length]);

  if (!enabled) return null;
  const event = index >= 0 ? activity[index] : undefined;

  return (
    <aside aria-label={t('label')} className="pointer-events-none fixed bottom-20 left-3 z-40 max-w-[calc(100vw-1.5rem)] sm:bottom-6 sm:left-6">
      <AnimatePresence>
        {visible && event && (
          <motion.div
            key={event.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto flex items-center gap-3 rounded-sm border border-line-strong bg-surface-raised py-2 pl-4 pr-1 shadow-constellation"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <p className="text-step-sm text-foreground">
              {t('joined', { name: event.firstName ?? t('someone'), plan: planName(event.plan) })}
              <span className="ml-2 font-mono text-step-xs text-ink-3">{relative(event.occurredAt, shownAt)}</span>
            </p>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label={t('dismiss')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-3 hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
