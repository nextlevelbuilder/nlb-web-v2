import type { BeforeSendFn } from 'posthog-js';
import { trafficPageContext } from '@/lib/traffic-client';

/** Public project key of the NLB PostHog project (US cloud); safe to ship to browsers. */
export const POSTHOG_PROJECT_KEY = 'phc_xYwTnLUxKdFRnvYkhgdMHwzm72S5Hre2HpbMjCKB2Gb5';
export const POSTHOG_API_HOST = 'https://us.i.posthog.com';
export const POSTHOG_UI_HOST = 'https://us.posthog.com';

/** Only the production domain reports, so staging, previews and local runs never pollute the project. */
const TRACKED_HOSTS = new Set(['nextlevelbuilder.io', 'www.nextlevelbuilder.io']);

export function isPostHogHost(hostname: string): boolean {
  return TRACKED_HOSTS.has(hostname);
}

const LOCALE_PREFIX = /^\/(?:en|vi)(?=\/|$)/;

/** Locale-less pathname, so `/vi/blog` and `/blog` aggregate as one page. */
export function pagePath(pathname: string): string {
  return pathname.replace(LOCALE_PREFIX, '') || '/';
}

/**
 * Surface tag read by the realtime traffic card (lib/traffic/posthog.ts): the Build with Us
 * directory keeps its own bucket, everything else is the site.
 */
export function surfaceFor(pathname: string): 'site' | 'build-with-us' {
  return trafficPageContext(pagePath(pathname)).directory ? 'build-with-us' : 'site';
}

/** Drops the query string and fragment, which carry OAuth codes, OTP state and checkout ids on private pages. */
function stripQuery(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Runs on every event before it leaves the browser:
 * - Studio previews of unpublished listings send nothing;
 * - private pages (sign-in, OAuth, account, checkout success) keep their path but lose query strings;
 * - every event carries the locale-less path, locale and surface for consistent breakdowns.
 */
export const beforeSendPostHog: BeforeSendFn = (event) => {
  if (!event) return null;
  const url = typeof event.properties?.$current_url === 'string' ? event.properties.$current_url : null;
  let pathname = '/';
  try {
    pathname = url ? new URL(url).pathname : window.location.pathname;
  } catch {
    // A malformed URL still gets the default surface tags below.
  }
  const page = trafficPageContext(pagePath(pathname));
  if (/^\/studio\/products\/[^/]+\/preview(?:\/|$)/.test(page.path)) return null;

  const properties = event.properties ?? {};
  if (!page.tracked) {
    properties.$current_url = stripQuery(properties.$current_url);
    properties.$referrer = stripQuery(properties.$referrer);
    if (event.event === '$pageview' || event.event === '$pageleave') properties.$search = undefined;
  }
  properties.nlb_path = page.path;
  properties.nlb_locale = LOCALE_PREFIX.exec(pathname)?.[0].slice(1) ?? 'en';
  properties.nlb_surface = page.directory ? 'build-with-us' : 'site';
  if (page.productSlug) properties.nlb_product_slug = page.productSlug;
  event.properties = properties;
  return event;
};
