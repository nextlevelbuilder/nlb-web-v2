'use client';

import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'nlb_bl_nav:';

/**
 * Whether the menu shows the Builder League entry. Signed-out viewers never see it. Admins see it from
 * the session the header already has, with no request. Other signed-in viewers are probed once per
 * browser tab (`GET /api/v1/builder-access`, cached in sessionStorage per user), so pages do not fetch
 * on every navigation and the static page shell stays static. Any failure keeps the entry hidden.
 */
export function useBuilderLeagueNav(user: { id: string; role?: string | null } | null | undefined): boolean {
  const userId = user?.id ?? null;
  const isAdmin = user?.role === 'admin';
  const [probed, setProbed] = useState<{ userId: string; show: boolean } | null>(null);

  useEffect(() => {
    if (!userId || isAdmin) return;
    const key = `${STORAGE_PREFIX}${userId}`;
    let cached: string | null = null;
    try {
      cached = window.sessionStorage.getItem(key);
    } catch {
      // Storage disabled: probe without caching.
    }
    const controller = new AbortController();
    const load: Promise<boolean> = cached === '1' || cached === '0'
      ? Promise.resolve(cached === '1')
      : fetch('/api/v1/builder-access', { credentials: 'same-origin', signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { data?: { showNav?: unknown } } | null) => {
          const show = body?.data?.showNav === true;
          try {
            window.sessionStorage.setItem(key, show ? '1' : '0');
          } catch {
            // Not cached; the next tab probes again.
          }
          return show;
        });
    load
      .then((show) => {
        if (!controller.signal.aborted) setProbed({ userId, show });
      })
      .catch(() => {
        // Hidden on failure.
      });
    return () => controller.abort();
  }, [userId, isAdmin]);

  if (!userId) return false;
  if (isAdmin) return true;
  return probed?.userId === userId && probed.show;
}
