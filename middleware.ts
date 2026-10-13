import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n/request';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware({
  // List of supported locales
  locales,

  // Default locale (Vietnamese)
  defaultLocale,

  // Don't add locale prefix for default locale
  // This means / will show Vietnamese content
  // and /en will show English content
  localePrefix: 'as-needed',

  // Detect locale from Accept-Language header and cookies
  localeDetection: true
});

export default function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.endsWith('.md')) {
    const destination = request.nextUrl.clone();
    destination.pathname = '/api/markdown';
    destination.search = '';
    destination.searchParams.set('path', request.nextUrl.pathname);
    destination.searchParams.set('query', request.nextUrl.search);
    return NextResponse.rewrite(destination);
  }
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except for:
  // - api routes
  // - go redirects
  // - llms.txt and sitemap.xml
  // - _next internals and static files
  matcher: ['/((?!api|go|llms\\.txt|sitemap\\.xml|_next|.*\\..*).*)', '/:path*.md', '/.md']
};
