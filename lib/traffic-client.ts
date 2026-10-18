const VISITOR_KEY = 'nlb_traffic_visitor';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memoryVisitorId: string | undefined;

export function getTrafficVisitorId(): string | null {
  if (typeof window === 'undefined' || navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes') return null;
  if ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true) return null;

  try {
    const stored = window.sessionStorage.getItem(VISITOR_KEY);
    if (stored && UUID_PATTERN.test(stored)) return stored;
  } catch {
    // Storage may be blocked; the identifier can still live in this page's memory.
  }

  try {
    memoryVisitorId ??= crypto.randomUUID();
  } catch {
    return null;
  }
  try {
    window.sessionStorage.setItem(VISITOR_KEY, memoryVisitorId);
  } catch {
    // Browsing and measurement must not depend on storage availability.
  }
  return memoryVisitorId;
}

export type TrafficPage = {
  /** Locale-less pathname, for example `/products/agentkit`. */
  path: string;
  /** False for private pages and Studio previews, which report nothing at all. */
  tracked: boolean;
  /** Present on a product page; drives the independent product collector. */
  productSlug?: string;
  /** True for the Build with Us directory, which owns the `product_id = ''` rows. */
  directory: boolean;
};

const PRIVATE_PATHS = /^\/(?:sign-in|sign-up|profile|account|oauth|success|onboarding)(?:\/|$)/;
const PREVIEW_PATHS = /^\/studio\/products\/[^/]+\/preview(?:\/|$)/;
const PRODUCT_PATH = /^\/products\/([a-z0-9-]+)$/;

/** Decide what a pathname may report before any request leaves the browser. */
export function trafficPageContext(pathname: string): TrafficPage {
  const path = (pathname.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  if (PRIVATE_PATHS.test(path) || PREVIEW_PATHS.test(path)) return { path, tracked: false, directory: false };
  const product = PRODUCT_PATH.exec(path);
  if (product) return { path, tracked: true, productSlug: product[1], directory: false };
  return { path, tracked: true, directory: path === '/build-with-us' };
}

function referrerOrigin(): string {
  try {
    const url = new URL(document.referrer);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
  } catch {
    // Direct visits and malformed referrers carry no source information.
    return '';
  }
}

function report(url: string, body: object): void {
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: 'same-origin',
    referrerPolicy: 'origin',
  }).catch(() => { /* Measurement failures must never interrupt navigation. */ });
}

/**
 * Feeds the independent collector for directory and product pages. Site-wide PostHog pageviews
 * come from the browser SDK (components/analytics/posthog-analytics.tsx), not from here.
 */
export function capturePageView(page: TrafficPage): void {
  if (!page.tracked || !(page.directory || page.productSlug)) return;
  const visitorId = getTrafficVisitorId();
  if (!visitorId) return;
  report('/api/traffic', { productSlug: page.productSlug, event: 'page_view', visitorId, referrer: referrerOrigin() });
}

/** Product website clicks stay in the independent collector's outbound ledger. */
export function captureOutboundClick(productSlug: string): void {
  const visitorId = getTrafficVisitorId();
  if (!visitorId) return;
  report('/api/traffic', { productSlug, event: 'outbound_click', visitorId, referrer: referrerOrigin() });
}

export function isProductOutboundLink(href: string, productSlug: string, origin: string): boolean {
  try {
    const url = new URL(href, origin);
    return url.origin === origin && decodeURIComponent(url.pathname) === `/go/${productSlug}`;
  } catch {
    return false;
  }
}

export type TrafficLoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error' };

/** Own the request, timeout and refresh timer together so unmount cancels all work. */
export function subscribeToTraffic<T>(
  url: string,
  parse: (value: unknown) => T,
  onChange: (state: TrafficLoadState<T>) => void,
  refreshMs?: number,
): { refresh: () => void; stop: () => void } {
  let stopped = false;
  let pending = false;
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const refresh = async () => {
    if (stopped || pending) return;
    pending = true;
    controller = new AbortController();
    const signal = controller.signal;
    timeout = setTimeout(() => controller?.abort(), 10_000);
    try {
      const response = await fetch(url, { signal, cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Traffic unavailable');
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('data' in payload)) throw new Error('Invalid traffic response');
      const data = parse(payload.data);
      if (!stopped) onChange({ status: 'ready', data });
    } catch {
      if (!stopped) onChange({ status: 'error' });
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  };

  onChange({ status: 'loading' });
  void refresh();
  const interval = refreshMs ? setInterval(() => { void refresh(); }, refreshMs) : undefined;
  return {
    refresh: () => {
      if (stopped || pending) return;
      onChange({ status: 'loading' });
      void refresh();
    },
    stop: () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(timeout);
      controller?.abort();
    },
  };
}
