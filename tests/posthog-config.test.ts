import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { beforeSendPostHog, isPostHogHost, pagePath, surfaceFor } from '@/lib/analytics/posthog-config';

const event = (url: string, extra: Record<string, unknown> = {}) =>
  ({ uuid: 'u', event: '$pageview', properties: { $current_url: url, ...extra } }) as unknown as CaptureResult;

describe('PostHog config', () => {
  it('reports only from the production domain', () => {
    expect(isPostHogHost('nextlevelbuilder.io')).toBe(true);
    expect(isPostHogHost('www.nextlevelbuilder.io')).toBe(true);
    expect(isPostHogHost('staging.nextlevelbuilder.io')).toBe(false);
    expect(isPostHogHost('localhost')).toBe(false);
  });

  it('strips the locale prefix and tags the directory surface', () => {
    expect(pagePath('/vi/blog')).toBe('/blog');
    expect(pagePath('/vi')).toBe('/');
    expect(pagePath('/video')).toBe('/video');
    expect(surfaceFor('/vi/build-with-us')).toBe('build-with-us');
    expect(surfaceFor('/pricing')).toBe('site');
  });

  it('adds path, locale, surface and product properties', () => {
    const result = beforeSendPostHog(event('https://nextlevelbuilder.io/vi/products/agentkit?ref=x'));
    expect(result?.properties).toMatchObject({
      nlb_path: '/products/agentkit', nlb_locale: 'vi', nlb_surface: 'site', nlb_product_slug: 'agentkit',
      $current_url: 'https://nextlevelbuilder.io/vi/products/agentkit?ref=x',
    });
  });

  it('drops Studio previews of unpublished listings', () => {
    expect(beforeSendPostHog(event('https://nextlevelbuilder.io/studio/products/abc/preview'))).toBeNull();
  });

  it('removes query strings on private pages', () => {
    const result = beforeSendPostHog(event('https://nextlevelbuilder.io/oauth/consent?code=secret&state=s', {
      $referrer: 'https://nextlevelbuilder.io/success?checkout_id=c1',
    }));
    expect(result?.properties.$current_url).toBe('https://nextlevelbuilder.io/oauth/consent');
    expect(result?.properties.$referrer).toBe('https://nextlevelbuilder.io/success');
  });
});
