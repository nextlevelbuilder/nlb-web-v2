'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeToTraffic, type TrafficLoadState } from '@/lib/traffic-client';

export function useTrafficData<T>(url: string | null, parse: (value: unknown) => T, refreshMs?: number) {
  const [result, setResult] = useState<{ url: string; state: TrafficLoadState<T> } | null>(null);
  const subscription = useRef<ReturnType<typeof subscribeToTraffic<T>> | null>(null);

  useEffect(() => {
    if (!url) return;
    const current = subscribeToTraffic(url, parse, (state) => setResult({ url, state }), refreshMs);
    subscription.current = current;
    return () => {
      current.stop();
      subscription.current = null;
    };
  }, [url, parse, refreshMs]);

  const state: TrafficLoadState<T> = result?.url === url ? result.state : { status: 'loading' };
  return { state, retry: () => subscription.current?.refresh() };
}
