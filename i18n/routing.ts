import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing for the whole site.
 * - English is the default and is served without a prefix (`/`, `/policies/terms`).
 * - Vietnamese lives under `/vi` (`/vi`, `/vi/policies/terms`).
 * - Unprefixed requests are matched against the NEXT_LOCALE cookie, then Accept-Language, so a
 *   Vietnamese browser opening an old VI deep link (the previous site served VI at `/`) is
 *   redirected to the same page under `/vi`. Old `/en/...` links redirect to the unprefixed path.
 */
export const locales = ['en', 'vi'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/** One year, so an explicit language choice survives browser restarts. */
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: true,
  localeCookie: { maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS },
});

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
