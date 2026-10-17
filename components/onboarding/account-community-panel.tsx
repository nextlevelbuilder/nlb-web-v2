'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConnectionSummary } from '@/lib/onboarding/status';
import CommunityConnectionCard from './community-connection-card';
import { fetchOnboardingStatus, type CommunityProvider } from './onboarding-api';

const PROVIDERS: CommunityProvider[] = ['discord', 'telegram'];
/** While an unlink is pending, re-read the status every few seconds for up to about two minutes. */
const UNLINK_POLL_MS = 3000;
const UNLINK_POLL_LIMIT = 40;

/** Discord and Telegram access on /account, with retry, reconnect and unlink. */
export default function AccountCommunityPanel({ initial }: { initial: Record<CommunityProvider, ConnectionSummary> }) {
  const [connections, setConnections] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      setConnections((await fetchOnboardingStatus()).connections);
    } catch {
      // Keep the last known state; the card already shows the action error.
    }
  }, []);

  const refreshSoon = useCallback(() => {
    void refresh();
    setTimeout(() => void refresh(), 4000);
  }, [refresh]);

  const pendingUnlink = PROVIDERS.some(
    (provider) => connections[provider].unlinking && connections[provider].status !== 'action_required'
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

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {PROVIDERS.map((provider) => (
        <CommunityConnectionCard
          key={provider}
          provider={provider}
          connection={connections[provider]}
          allowUnlink
          onChanged={refreshSoon}
          onAwaitingTelegram={refreshSoon}
        />
      ))}
    </div>
  );
}
