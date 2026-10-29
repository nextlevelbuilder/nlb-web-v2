import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeTrafficSchema } from '@nextlevelbuilder/contracts';
import { captureOutboundClick, capturePageView, getTrafficVisitorId, isProductOutboundLink, subscribeToTraffic, trafficPageContext } from '@/lib/traffic-client';

const visitorId = 'e24e18a5-dd11-4f2c-9f4b-9fc3376bc911';
const realMetrics = {
  source: 'posthog', activeVisitors: 3, pageViews30d: 20, visitors30d: 11,
  updatedAt: '2026-09-12T01:00:00.000Z', windowMinutes: 5, windowDays: 30,
};

beforeEach(() => {
  vi.stubGlobal('window', {
    sessionStorage: { getItem: vi.fn(() => visitorId), setItem: vi.fn() },
  });
  vi.stubGlobal('navigator', { doNotTrack: '0' });
  vi.stubGlobal('document', { referrer: 'https://example.com/article' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('traffic capture', () => {
  it('reuses the session identifier and reports a product view to the independent collector', () => {
    expect(getTrafficVisitorId()).toBe(visitorId);
    capturePageView(trafficPageContext('/products/builder-tool'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/traffic', expect.objectContaining({
      keepalive: true,
      body: JSON.stringify({ productSlug: 'builder-tool', event: 'page_view', visitorId, referrer: 'https://example.com' }),
    }));
  });

  it('sends directory visits to independent traffic collection', () => {
    capturePageView(trafficPageContext('/build-with-us'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/traffic', expect.objectContaining({
      body: JSON.stringify({ event: 'page_view', visitorId, referrer: 'https://example.com' }),
    }));
  });

  it('leaves other pages to the PostHog browser SDK', () => {
    capturePageView(trafficPageContext('/pricing'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['/profile', '/account/billing', '/sign-in', '/oauth/consent', '/success', '/studio/products/agentkit/preview'])('reports nothing for %s', (path) => {
    const page = trafficPageContext(path);
    expect(page.tracked).toBe(false);
    capturePageView(page);
    expect(fetch).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem).not.toHaveBeenCalled();
  });

  it('classifies pathnames without reporting the query string or locale prefix', () => {
    expect(trafficPageContext('/build-with-us')).toEqual({ path: '/build-with-us', tracked: true, directory: true });
    expect(trafficPageContext('/products/builder-tool/')).toEqual({ path: '/products/builder-tool', tracked: true, productSlug: 'builder-tool', directory: false });
    expect(trafficPageContext('/leaderboards?page=2')).toEqual({ path: '/leaderboards', tracked: true, directory: false });
    expect(trafficPageContext('/')).toEqual({ path: '/', tracked: true, directory: false });
    expect(trafficPageContext('/studio')).toEqual({ path: '/studio', tracked: true, directory: false });
    expect(trafficPageContext('/STUDIO/products/agentkit/preview')).toEqual({ path: '/STUDIO/products/agentkit/preview', tracked: true, directory: false });
  });

  it.each(['1', 'yes'])('respects Do Not Track %s without creating an identifier', (doNotTrack) => {
    vi.stubGlobal('navigator', { doNotTrack });
    expect(getTrafficVisitorId()).toBeNull();
    capturePageView(trafficPageContext('/build-with-us'));
    expect(fetch).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem).not.toHaveBeenCalled();
  });

  it('respects Global Privacy Control for directory, product and click events', () => {
    vi.stubGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: true });
    expect(getTrafficVisitorId()).toBeNull();
    capturePageView(trafficPageContext('/build-with-us'));
    capturePageView(trafficPageContext('/products/builder-tool'));
    captureOutboundClick('builder-tool');
    expect(fetch).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem).not.toHaveBeenCalled();
    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('continues capture when Global Privacy Control is explicitly false', () => {
    vi.stubGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false });
    capturePageView(trafficPageContext('/products/builder-tool'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends only referrer origin and limits the browser Referer header to origin', () => {
    vi.stubGlobal('document', { referrer: 'https://user:password@example.com:8443/private/customer?token=secret#private' });
    capturePageView(trafficPageContext('/products/builder-tool'));
    expect(fetch).toHaveBeenCalledWith('/api/traffic', expect.objectContaining({
      referrerPolicy: 'origin',
      body: JSON.stringify({ productSlug: 'builder-tool', event: 'page_view', visitorId, referrer: 'https://example.com:8443' }),
    }));
  });

  it.each(['', 'invalid-referrer', 'data:text/plain,secret', 'file:///private/document'])('omits unavailable or non-web referrer details: %s', (referrer) => {
    vi.stubGlobal('document', { referrer });
    capturePageView(trafficPageContext('/build-with-us'));
    expect(fetch).toHaveBeenCalledWith('/api/traffic', expect.objectContaining({
      body: JSON.stringify({ event: 'page_view', visitorId, referrer: '' }),
    }));
  });

  it('keeps a valid memory identifier when session storage is blocked', () => {
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('Storage blocked'); } });
    const first = getTrafficVisitorId();
    expect(first).toMatch(/^[\da-f-]{36}$/i);
    expect(getTrafficVisitorId()).toBe(first);
  });

  it('replaces malformed stored identifiers', () => {
    vi.mocked(window.sessionStorage.getItem).mockReturnValue('invalid-value');
    const nextId = getTrafficVisitorId();
    expect(nextId).toMatch(/^[\da-f-]{36}$/i);
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith('nlb_traffic_visitor', nextId);
  });

  it('does not retry a rejected event or interrupt navigation', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network offline'));
    expect(() => captureOutboundClick('builder-tool')).not.toThrow();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('counts only this product’s same-origin redirect link', () => {
    const origin = 'https://nextlevelbuilder.io';
    expect(isProductOutboundLink('/go/builder-tool?source=product', 'builder-tool', origin)).toBe(true);
    expect(isProductOutboundLink(`${origin}/go/builder-tool`, 'builder-tool', origin)).toBe(true);
    expect(isProductOutboundLink('/go/other-product', 'builder-tool', origin)).toBe(false);
    expect(isProductOutboundLink('https://example.com/go/builder-tool', 'builder-tool', origin)).toBe(false);
    expect(isProductOutboundLink('/go/%E0%A4%A', 'builder-tool', origin)).toBe(false);
  });
});

describe('traffic loading and refresh lifecycle', () => {
  const parse = (value: unknown) => RealtimeTrafficSchema.parse(value);

  it('loads real data, refreshes every 30 seconds, and stops on cleanup', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async () => Response.json({ data: realMetrics }));
    const onChange = vi.fn();
    const subscription = subscribeToTraffic('/api/traffic/realtime', parse, onChange, 30_000);
    expect(onChange).toHaveBeenCalledWith({ status: 'loading' });
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', data: realMetrics });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    subscription.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows unavailable for server errors and supports explicit retry', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: realMetrics }));
    const onChange = vi.fn();
    const subscription = subscribeToTraffic('/api/traffic/realtime', parse, onChange);
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith({ status: 'error' });
    subscription.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', data: realMetrics });
    subscription.stop();
  });

  it.each([{ data: {} }, { data: { ...realMetrics, activeVisitors: -2 } }, null])('never renders malformed responses as zero: %j', async (payload) => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(payload));
    const onChange = vi.fn();
    const subscription = subscribeToTraffic('/api/traffic/realtime', parse, onChange);
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith({ status: 'error' });
    subscription.stop();
  });

  it('cancels an in-flight request and suppresses updates after unmount', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init?.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const onChange = vi.fn();
    const subscription = subscribeToTraffic('/api/traffic/realtime', parse, onChange, 30_000);
    subscription.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    subscription.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signal?.aborted).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out stalled requests so loading cannot last indefinitely', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const onChange = vi.fn();
    const subscription = subscribeToTraffic('/api/traffic/realtime', parse, onChange);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onChange).toHaveBeenLastCalledWith({ status: 'error' });
    subscription.stop();
  });
});
