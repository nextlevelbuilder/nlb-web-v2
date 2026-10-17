'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MEMBERSHIP_PLAN_NAMES } from '@/lib/constants/launch';
import type { MembershipActivity } from '@/lib/home/recent-membership-activity';

const FIRST_DELAY_MS = 9000;
const VISIBLE_MS = 6000;
const RESUME_MS = 2500;
const GAP_MIN_MS = 12000;
const GAP_RANGE_MS = 8000;

/**
 * Live-activity toast from real recent membership joins only (first name or anonymised). Disabled
 * when there are no events or under reduced motion; skips while the tab is hidden or the menu is
 * open; hover holds it; dismissing stops the feed for this visit.
 */
export default function ActivityToast({ activity }: { activity: MembershipActivity[] }) {
  const t = useTranslations('home.activity');
  const [enabled, setEnabled] = useState(false);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [shownAt, setShownAt] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideRef = useRef<() => void>(() => {});

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnabled(activity.length > 0 && !reduce);
  }, [activity.length]);

  useEffect(() => {
    if (!enabled) return;
    let shown = 0;
    const show = () => {
      const menu = document.getElementById('menu');
      if (document.hidden || (menu && !menu.hidden)) { queue(); return; }
      setIndex(shown++ % activity.length);
      setShownAt(Date.now());
      setVisible(true);
      hideTimer.current = setTimeout(hide, VISIBLE_MS);
    };
    const hide = () => { setVisible(false); queue(); };
    const queue = () => { nextTimer.current = setTimeout(show, GAP_MIN_MS + Math.random() * GAP_RANGE_MS); };
    nextTimer.current = setTimeout(show, FIRST_DELAY_MS);
    hideRef.current = hide;
    return () => { clearTimeout(hideTimer.current); clearTimeout(nextTimer.current); };
  }, [enabled, activity.length]);


  if (!enabled) return null;
  const event = activity[index];
  const minutes = Math.max(1, Math.round((shownAt - (event?.occurredAt ?? shownAt)) / 60000));
  const ago = minutes < 60
    ? t('minutesAgo', { count: minutes })
    : minutes < 1440 ? t('hoursAgo', { count: Math.round(minutes / 60) }) : t('daysAgo', { count: Math.round(minutes / 1440) });

  return (
    <aside
      className={visible ? 'toast show' : 'toast'}
      id="toast"
      aria-label={t('label')}
      onPointerEnter={() => clearTimeout(hideTimer.current)}
      onPointerLeave={() => { if (visible) hideTimer.current = setTimeout(() => hideRef.current(), RESUME_MS); }}
    >
      <span className="t-star" aria-hidden="true" />
      <p>
        {event ? t('joined', { name: event.firstName ?? t('someone'), plan: MEMBERSHIP_PLAN_NAMES[event.plan] }) : null}
        <span>{event ? ago : null}</span>
      </p>
      <button
        type="button"
        aria-label={t('dismiss')}
        tabIndex={visible ? 0 : -1}
        onClick={() => { clearTimeout(hideTimer.current); clearTimeout(nextTimer.current); setVisible(false); setEnabled(false); }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.3" /></svg>
      </button>
    </aside>
  );
}
