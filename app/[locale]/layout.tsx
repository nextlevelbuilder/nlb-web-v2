import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SiteTrafficTracker } from '@/components/traffic/site-traffic-tracker';
import { isLocale, locales } from '@/i18n/routing';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Locale shell. The header (components/navbar.tsx, which also renders the skip link) and the footer
 * are rendered by each page so the homepage can place them inside its own narrative layout.
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
      {children}
    </NextIntlClientProvider>
  );
}
