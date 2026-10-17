/** Referral attribution appended to every outbound link in the /courses sidebar. */
export const SIDEBAR_UTM = {
  utm_source: "nextlevelbuilder",
  utm_medium: "referral",
  utm_campaign: "courses_sidebar",
} as const;

/**
 * Returns `url` with the sidebar UTM params set. Existing query params (e.g. `?lang=vi`) and the hash
 * are kept; UTM keys already present are overwritten rather than duplicated. A value that is not an
 * absolute http(s) URL is returned unchanged so a bad input never throws during render.
 */
export function withSidebarUtm(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return url;
  for (const [key, value] of Object.entries(SIDEBAR_UTM)) parsed.searchParams.set(key, value);
  return parsed.toString();
}
