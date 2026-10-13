'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';
import { PublicTrafficSummarySchema, type AnalyticsBlock } from '@/packages/contracts/src';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTrafficData } from '@/components/traffic/use-traffic-data';

const parseSummary = (value: unknown) => PublicTrafficSummarySchema.parse(value);

export function AnalyticsBlockView({ block, productSlug }: { block: AnalyticsBlock; productSlug?: string }) {
  const { title, period } = block.props;
  const url = productSlug ? `/api/v1/products/${encodeURIComponent(productSlug)}/traffic/public?period=${period}` : null;
  const { state, retry } = useTrafficData(url, parseSummary);

  return (
    <Card className="p-6 sm:p-8 rounded-2xl border border-primary/20 bg-primary/[0.02] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" aria-hidden="true" />{title}</h2>
        <span className="text-xs text-muted-foreground">Last {period.slice(0, -1)} days</span>
      </div>
      <p className="text-sm text-muted-foreground">Traffic to this product page on Next Level Builders.</p>
      <div className="min-h-28" aria-live="polite" aria-busy={Boolean(productSlug) && state.status === 'loading'}>
        {!productSlug ? (
          <p className="text-sm text-muted-foreground">Traffic is available on the published product page. Publishing this block makes aggregate traffic public. Preview visits are not counted.</p>
        ) : state.status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading traffic…</p>
        ) : state.status === 'error' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Traffic is temporarily unavailable.</p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['Page views', state.data.pageViews],
                ['Daily sessions', state.data.visitors],
                ['Website clicks', state.data.outboundClicks],
                ['Active visitors · 5 min', state.data.activeVisitors],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-background/50 border border-white/10 p-4">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-bold tabular-nums mt-1">{value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {state.data.pageViews === 0 && <p className="text-sm text-muted-foreground">No page views recorded in this period yet.</p>}
            {state.data.series.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Daily traffic (UTC)</summary>
                <div className="overflow-x-auto mt-3 max-h-72">
                  <table className="w-full text-xs text-left">
                    <caption className="sr-only">Daily page views, sessions, and website clicks</caption>
                    <thead><tr className="border-b border-white/10"><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Views</th><th scope="col" className="p-2">Sessions</th><th scope="col" className="p-2">Clicks</th></tr></thead>
                    <tbody>{state.data.series.map((day) => <tr key={day.date} className="border-b border-white/5 tabular-nums"><th scope="row" className="p-2 font-normal whitespace-nowrap">{day.date}</th><td className="p-2">{day.pageViews.toLocaleString()}</td><td className="p-2">{day.visitors.toLocaleString()}</td><td className="p-2">{day.outboundClicks.toLocaleString()}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            )}
            <p className="text-xs text-muted-foreground">Updated <time dateTime={state.data.updatedAt}>{new Date(state.data.updatedAt).toLocaleString()}</time> · Daily sessions count each browser session once per UTC day. Returning on another day counts again; these are not unique people.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
