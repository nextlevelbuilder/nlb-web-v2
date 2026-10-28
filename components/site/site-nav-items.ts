/**
 * Primary navigation shared by the desktop header and the full-screen menu.
 * Pure data + helpers (no React) so the routing rules are unit-testable.
 */
export type NavKey = 'courses' | 'live' | 'directory' | 'leaderboard' | 'blog' | 'pricing' | 'buildWithUs' | 'builderLeague';

export interface NavItem {
  key: NavKey;
  /** Locale-aware route on every page. */
  route: string | { pathname: '/'; hash: string };
  /** Set only for home sections: a plain in-page anchor while on the home page (scrolled by the home engine). */
  homeAnchor?: string;
  /** Chapter numeral shown in the mobile menu. */
  numeral: string;
}

// The old site's set (Directory, Leaderboard, Pricing, Build with us) plus Courses and Blog, in reading order.
export const NAV: readonly NavItem[] = [
  { key: 'courses', route: '/courses', numeral: 'III' },
  { key: 'directory', route: '/build-with-us', numeral: 'IV' },
  { key: 'leaderboard', route: '/leaderboards', numeral: 'IV·i' },
  { key: 'blog', route: '/blog', numeral: 'IX' },
  { key: 'pricing', route: { pathname: '/', hash: 'pricing' }, homeAnchor: '#pricing', numeral: 'VI' },
  { key: 'buildWithUs', route: '/build-with-us/instructions', numeral: 'VII' },
];

/**
 * Builder League entry, appended to the menu only for viewers who can reach it (flag on, admin or pilot);
 * see `useBuilderLeagueNav`. Kept out of `NAV` so the public menu never advertises a hidden feature.
 */
export const BUILDER_LEAGUE_NAV: NavItem = { key: 'builderLeague', route: '/builder-league', numeral: 'X' };

/**
 * NLB Live entry, inserted after Courses only while the Live flag is on (the pages 404 otherwise);
 * see `useLiveNav`.
 * Kept out of `NAV` for the same reason as the Builder League entry.
 */
export const LIVE_NAV: NavItem = { key: 'live', route: '/live', numeral: 'XI' };

/** The menu for a viewer: the public items, plus Live (flag on) and Builder League (reachable) entries. */
export function navItemsFor(showBuilderLeague: boolean, showLive = false): readonly NavItem[] {
  if (!showBuilderLeague && !showLive) return NAV;
  const items: NavItem[] = [];
  for (const item of NAV) {
    items.push(item);
    if (showLive && item.key === 'courses') items.push(LIVE_NAV);
  }
  if (showBuilderLeague) items.push(BUILDER_LEAGUE_NAV);
  return items;
}

/** `aria-current="page"` rule: the exact route, or a nested path that no more specific nav item owns. */
export function isCurrentNavItem(pathname: string, item: NavItem): boolean {
  if (typeof item.route !== 'string') return false;
  const route = item.route;
  if (pathname === route) return true;
  if (!pathname.startsWith(`${route}/`)) return false;
  // "Directory" owns /build-with-us/* except /build-with-us/instructions, which belongs to "Build with us".
  return !NAV.some((other) => other !== item && typeof other.route === 'string'
    && other.route.startsWith(`${route}/`) && (pathname === other.route || pathname.startsWith(`${other.route}/`)));
}
