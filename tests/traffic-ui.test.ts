import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlockRenderer } from '@/components/blocks/block-renderer';
import { RealtimeTrafficCard } from '@/components/traffic/realtime-traffic-card';
import { AnalyticsBlockSchema } from '@/packages/contracts/src';

describe('traffic rendering', () => {
  const block = AnalyticsBlockSchema.parse({ id: 'traffic-summary', type: 'analytics', props: {} });

  it('explains unavailable preview statistics without invented numbers', () => {
    const html = renderToStaticMarkup(React.createElement(BlockRenderer, { blocks: [block] }));
    expect(html).toContain('Traffic');
    expect(html).toContain('Last 30 days');
    expect(html).toContain('Publishing this block makes aggregate traffic public');
    expect(html).toContain('Preview visits are not counted');
    expect(html).not.toContain('<dd');
    expect(html).not.toContain('Loading traffic');
  });

  it('waits for product metrics when the published page supplies product context', () => {
    const html = renderToStaticMarkup(React.createElement(BlockRenderer, { blocks: [block], productSlug: 'builder-tool' }));
    expect(html).toContain('Loading traffic');
    expect(html).not.toContain('Publishing this block');
    expect(html).not.toContain('<dd');
  });

  it('does not accept product identity through editable block props', () => {
    const untrustedBlock = { ...block, props: { ...block.props, productSlug: 'another-product' } };
    const html = renderToStaticMarkup(React.createElement(BlockRenderer, { blocks: [untrustedBlock] }));
    expect(html).toContain('Preview visits are not counted');
    expect(html).not.toContain('Loading traffic');
  });

  it('renders an honest directory loading state and refresh interval', () => {
    const html = renderToStaticMarkup(React.createElement(RealtimeTrafficCard));
    expect(html).toContain('Directory traffic');
    expect(html).toContain('Refreshes every 30 seconds');
    expect(html).toContain('Loading traffic');
    expect(html).not.toContain('<dd');
  });
});
