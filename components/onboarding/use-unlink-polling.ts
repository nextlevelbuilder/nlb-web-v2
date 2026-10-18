'use client';

import { useEffect } from 'react';
import type { ConnectionSummary } from '@/lib/onboarding/status';

/** While an unlink is pending, re-read the status every few seconds for up to about two minutes. */
const UNLINK_POLL_MS = 3000;
const UNLINK_POLL_LIMIT = 40;

/**
 * Polls `refresh` while any community shows a pending unlink (processing, not yet failed), so the
 * card updates when the reconcile job removes access and deletes the link.
 */
export function useUnlinkPolling(
  connections: Readonly<Record<string, ConnectionSummary>> | null | undefined,
  refresh: () => unknown
): void {
  const pendingUnlink = Object.values(connections ?? {}).some(
    (connection) => connection.unlinking && connection.status !== 'action_required'
  );
  useEffect(() => {
    if (!pendingUnlink) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > UNLINK_POLL_LIMIT) clearInterval(timer);
      else void refresh();
    }, UNLINK_POLL_MS);
    return () => clearInterval(timer);
  }, [pendingUnlink, refresh]);
}
