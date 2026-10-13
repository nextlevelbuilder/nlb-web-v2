'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import { RealtimeTrafficSchema } from '@/packages/contracts/src';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTrafficData } from './use-traffic-data';

const parseRealtime = (value: unknown) => RealtimeTrafficSchema.parse(value);

export function RealtimeTrafficCard() {
  const { state, retry } = useTrafficData('/api/traffic/realtime', parseRealtime, 30_000);
  return (
    <Card className="p-6 rounded-3xl bg-white/[0.02] border-white/10 space-y-4 shadow-md">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="font-bold text-lg">Directory traffic</h3>
      </div>
      <p className="text-xs text-muted-foreground">Traffic across nextlevelbuilder.io (daily sessions). Refreshes every 30 seconds.</p>
      <div className="min-h-36" aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <p className="text-sm text-muted-foreground">Loading traffic…</p>}
        {state.status === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Traffic is temporarily unavailable.</p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
          </div>
        )}
        {state.status === 'ready' && (
          <div className="space-y-4">
            <dl>
              <dt className="text-xs text-muted-foreground">Active visitors · last {state.data.windowMinutes} minutes</dt>
              <dd className="text-3xl font-bold tabular-nums text-primary">{state.data.activeVisitors.toLocaleString()}</dd>
            </dl>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Visitors · last {state.data.windowDays} days</dt><dd className="font-semibold tabular-nums">{state.data.visitors30d.toLocaleString()}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Page views · last {state.data.windowDays} days</dt><dd className="font-semibold tabular-nums">{state.data.pageViews30d.toLocaleString()}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">PostHog · Updated <time dateTime={state.data.updatedAt}>{new Date(state.data.updatedAt).toLocaleTimeString(undefined, { timeZone: 'UTC', timeZoneName: 'short' })}</time></p>
          </div>
        )}
      </div>
    </Card>
  );
}
