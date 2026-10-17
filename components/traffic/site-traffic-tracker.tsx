'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/navigation';
import { captureOutboundClick, capturePageView, isProductOutboundLink, trafficPageContext } from '@/lib/traffic-client';

/**
 * Mounted once for every localized page. Private pages and Studio previews report
 * nothing; the independent collector receives only directory and product-page rows.
 * Site-wide PostHog tracking lives in components/analytics/posthog-analytics.tsx.
 */
export function SiteTrafficTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    const page = trafficPageContext(pathname);
    if (!page.tracked) return;
    // Re-renders and StrictMode effect replays must not create extra page views.
    if (lastTracked.current !== page.path) {
      lastTracked.current = page.path;
      capturePageView(page);
    }

    const productSlug = page.productSlug;
    if (!productSlug) return;
    const onClick = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      const href = anchor?.getAttribute('href');
      if (href && isProductOutboundLink(href, productSlug, window.location.origin)) {
        captureOutboundClick(productSlug);
      }
    };
    document.addEventListener('click', onClick);
    document.addEventListener('auxclick', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('auxclick', onClick);
    };
  }, [pathname]);

  return null;
}
