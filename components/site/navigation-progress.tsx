'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { completeNavigation, isNavigationPending, subscribeNavigation } from '@/lib/navigation/navigation-progress-store';
import { nextTrickleProgress } from '@/lib/navigation/navigation-progress-trickle';

/** Fast navigations finish before the bar shows, so a prefetched route never flashes it. */
const SHOW_DELAY_MS = 120;
/** Screen readers hear "Loading page" only when the wait is long enough to notice. */
const ANNOUNCE_DELAY_MS = 700;
const TRICKLE_INTERVAL_MS = 280;
/** A navigation that never commits (aborted, same-route redirect) must not leave the bar stuck. */
const GIVE_UP_MS = 15_000;
/** Matches `--d-2` (fill to 100%) and `--d-3` (fade out) in constellation-shell.css. */
const FILL_MS = 260;
const FADE_MS = 600;

type Phase = 'idle' | 'loading' | 'finishing';

/**
 * Thin accent bar under the top edge while an App Router navigation is in flight. Visual only
 * (`aria-hidden`); a polite live region announces slow loads. Fixed-position, so no layout shift.
 */
export default function NavigationProgress() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [announce, setAnnounce] = useState(false);

  // The new route committed: the navigation is over.
  useEffect(() => {
    completeNavigation();
  }, [pathname, search]);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let trickle: ReturnType<typeof setInterval> | undefined;
    let shown = false;
    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers = [];
      clearInterval(trickle);
    };
    const sync = () => {
      clearTimers();
      if (isNavigationPending()) {
        timers.push(setTimeout(() => {
          shown = true;
          setPhase('loading');
          setProgress(nextTrickleProgress(0));
          trickle = setInterval(() => setProgress((value) => nextTrickleProgress(value)), TRICKLE_INTERVAL_MS);
        }, SHOW_DELAY_MS));
        timers.push(setTimeout(() => setAnnounce(true), ANNOUNCE_DELAY_MS));
        timers.push(setTimeout(completeNavigation, GIVE_UP_MS));
        return;
      }
      setAnnounce(false);
      if (!shown) return;
      // A shown bar fills to the end, fades, then resets off-screen.
      shown = false;
      setPhase('finishing');
      setProgress(1);
      timers.push(setTimeout(() => {
        setPhase('idle');
        setProgress(0);
      }, FILL_MS + FADE_MS));
    };
    const unsubscribe = subscribeNavigation(sync);
    if (isNavigationPending()) sync();
    return () => {
      unsubscribe();
      clearTimers();
    };
  }, []);

  return (
    <>
      <div className="nav-progress" data-phase={phase} aria-hidden="true">
        <div className="nav-progress-bar" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announce ? t('loadingPage') : ''}
      </div>
    </>
  );
}
