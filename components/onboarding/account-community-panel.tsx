'use client';

import { useCallback, useState } from 'react';
import type { ConnectionSummary } from '@/lib/onboarding/status';
import CommunityConnectionCard from './community-connection-card';
import { fetchOnboardingStatus, type CommunityProvider } from './onboarding-api';
import { useUnlinkPolling } from './use-unlink-polling';

const PROVIDERS: CommunityProvider[] = ['discord', 'telegram'];

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

  useUnlinkPolling(connections, refresh);

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
