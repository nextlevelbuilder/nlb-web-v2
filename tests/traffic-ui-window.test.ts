import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The card's only data entry point. Stubbing it lets the ready state be rendered
// on the server, which is the only way this repository's node-environment suite
// can observe the labels the change introduces.
vi.mock('@/components/traffic/use-traffic-data', () => ({
  useTrafficData: () => ({
    state: {
      status: 'ready',
      data: {
        source: 'posthog', activeVisitors: 3, pageViews30d: 7, visitors30d: 42,
        updatedAt: '2026-09-12T01:00:00.000Z', windowMinutes: 5, windowDays: 30,
      },
    },
    retry: () => {},
  }),
}));

import { RealtimeTrafficCard } from '@/components/traffic/realtime-traffic-card';

describe('directory traffic card window', () => {
  it('pairs each 30-day counter with its own value and keeps the five-minute activity line', () => {
    const html = renderToStaticMarkup(React.createElement(RealtimeTrafficCard));
    expect(html).toMatch(/Visitors · last 30 days<\/dt><dd[^>]*>42</);
    expect(html).toMatch(/Page views · last 30 days<\/dt><dd[^>]*>7</);
    expect(html).toContain('Active visitors · last 5 minutes');
    expect(html).toMatch(/Active visitors · last 5 minutes<\/dt><dd[^>]*>3</);
    expect(html).not.toMatch(/today \(UTC\)/i);
  });
});
