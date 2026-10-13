'use client';

import { useSyncExternalStore } from 'react';
import Script from 'next/script';
import { GA_MEASUREMENT_ID, isAnalyticsAllowed, type PrivacySignals } from '@/lib/constants/analytics-consent';

const subscribeNever = () => () => {};
const readBrowserConsent = () => isAnalyticsAllowed(navigator as Navigator & PrivacySignals);

/**
 * Loads GA4 only after hydration and only when the browser sends neither Do Not Track nor
 * Global Privacy Control. Renders nothing otherwise (and on the server).
 */
export default function GoogleAnalyticsConsentAware() {
  // Server snapshot is `false`, so nothing renders during SSR or hydration; the browser value is
  // read only on the client after hydration (equivalent to a post-mount effect, without a cascade render).
  const allowed = useSyncExternalStore(subscribeNever, readBrowserConsent, () => false);

  if (!allowed) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
