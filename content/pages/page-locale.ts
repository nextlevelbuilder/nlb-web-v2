/** Locales served by the inner-page content modules. */
export type PageLocale = "en" | "vi";

/** Vietnamese for `vi`, English for everything else. */
export function toPageLocale(locale: string): PageLocale {
  return locale === "vi" ? "vi" : "en";
}
