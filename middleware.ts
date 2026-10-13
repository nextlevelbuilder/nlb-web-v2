import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

/**
 * EN is served at `/` and VI at `/vi` (see i18n/routing.ts). Locale detection uses the
 * NEXT_LOCALE cookie first, then Accept-Language, for unprefixed paths.
 */
const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Markdown twins: `/any/path.md` is rendered by the markdown API route.
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
  // - docs/* (root-level, non-localized redirects such as /docs/api -> /api-docs)
  // - llms.txt and sitemap.xml
  // - _next internals and static files
  matcher: ['/((?!api|go|docs/|llms\\.txt|sitemap\\.xml|_next|.*\\..*).*)', '/:path*.md', '/.md'],
};
