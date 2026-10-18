/**
 * Builder League pages that discovery surfaces (sitemap, llms.txt, markdown twins) may advertise.
 *
 * Only Community Wrapped (`/wrapped/{year}`) is public, and only while `BUILDER_LEAGUE_ENABLED` is on;
 * with the flag off (production today) nothing new is advertised. Member pages, settings, the studio
 * and personal share links (`/wrapped/{year}/{token}`) are never listed.
 */
import { isBuilderLeagueEnabled } from "./access";
import { localYear } from "./time-windows";

/** First year with a Community Wrapped (the league launched in 2026). */
export const FIRST_WRAPPED_YEAR = 2026;

/** Unlocalized Community Wrapped paths, newest first; empty while the flag is off. */
export function publicWrappedPaths(now: Date = new Date(), enabled: boolean = isBuilderLeagueEnabled()): string[] {
  if (!enabled) return [];
  const paths: string[] = [];
  for (let year = localYear(now); year >= FIRST_WRAPPED_YEAR; year--) paths.push(`/wrapped/${year}`);
  return paths;
}

/** True for an unlocalized path that `publicWrappedPaths` lists. */
export function isPublicWrappedPath(path: string, now: Date = new Date(), enabled: boolean = isBuilderLeagueEnabled()): boolean {
  return /^\/wrapped\/\d{4}$/.test(path) && publicWrappedPaths(now, enabled).includes(path);
}
