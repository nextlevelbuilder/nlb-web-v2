import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import SiteCursor from '@/components/site/site-cursor';
import SiteFooter from '@/components/site/site-footer';
import SiteHeader from '@/components/site/site-header';
import SiteSoundEffects from '@/components/site/site-sound-effects';
import StaticSky from '@/components/site/static-sky';
import { SiteTrafficTracker } from '@/components/traffic/site-traffic-tracker';
import { isLocale, locales } from '@/i18n/routing';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Locale shell shared by every page: static sky + graticule, custom cursor, the Constellation header
 * (with the skip link to #main) and footer. Each page renders its own <main id="main">; the home page
 * adds the live WebGL sky on top of the static one.
 */
export default async function LocaleLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SiteTrafficTracker />
      <StaticSky />
      <SiteCursor />
      <SiteHeader />
      <SiteSoundEffects />
      {children}
      <SiteFooter />
    </NextIntlClientProvider>
  );
}
