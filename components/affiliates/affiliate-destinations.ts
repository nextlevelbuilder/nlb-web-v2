/**
 * Landing pages offered in the link form. Each is a path the server allowlist accepts
 * (`normalizeDestination` in lib/referrals/affiliate-links.ts), optionally under `/vi`.
 */
export const DESTINATION_KEYS = ["home", "pricing", "courses", "blog", "affiliates"] as const;
export type DestinationKey = (typeof DESTINATION_KEYS)[number];
export type DestinationLanguage = "en" | "vi";

const SUFFIX: Record<DestinationKey, string> = {
  home: "",
  pricing: "#pricing",
  courses: "/courses",
  blog: "/blog",
  affiliates: "/affiliates",
};

export function destinationPath(key: DestinationKey, language: DestinationLanguage): string {
  const prefix = language === "vi" ? "/vi" : "";
  const suffix = SUFFIX[key];
  if (!prefix) return suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${prefix}${suffix}`;
}

/** The form choice for a stored path, or null when the link points somewhere the form does not offer. */
export function parseDestination(path: string): { key: DestinationKey; language: DestinationLanguage } | null {
  for (const language of ["en", "vi"] as const) {
    for (const key of DESTINATION_KEYS) {
      if (destinationPath(key, language) === path) return { key, language };
    }
  }
  return null;
}
