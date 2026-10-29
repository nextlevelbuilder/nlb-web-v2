'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nlb_live_nav';

/**
 * Whether the menu shows the NLB Live entry. The flag is the deployed runtime `LIVE_ENABLED` value,
 * which a prerendered page shell cannot carry, so it is probed once per browser tab
 * (`GET /api/v1/live/nav`, cached in sessionStorage) the same way `useBuilderLeagueNav` probes league
 * access. The static page shell stays static. Any failure keeps the entry hidden.
 */
export function useLiveNav(): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cached: string | null = null;
    try {
      cached = window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage disabled: probe without caching.
    }
    const controller = new AbortController();
    const load: Promise<boolean> = cached === '1' || cached === '0'
      ? Promise.resolve(cached === '1')
      : fetch('/api/v1/live/nav', { credentials: 'same-origin', signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { data?: { showNav?: unknown } } | null) => {
          const next = body?.data?.showNav === true;
          try {
            window.sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0');
          } catch {
            // Not cached; the next tab probes again.
          }
          return next;
        });
    load
      .then((next) => {
        if (!controller.signal.aborted) setShow(next);
      })
      .catch(() => {
        // Hidden on failure.
      });
    return () => controller.abort();
  }, []);

  return show;
}
