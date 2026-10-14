import { z } from "zod";
import { cachedSidebarLoad } from "./sidebar-cache";
import { fetchSidebarText } from "./sidebar-http";

/**
 * Latest "Knowledges" articles from ZueyOS (zuey.me), via its public JSON endpoint:
 *   GET https://zuey.me/api/v1/articles?sort=new&limit=5&lang=<en|vi>
 *   -> { success: true, data: [{ slug, locale, title, excerpt, published_at, cover_url, reading_minutes, access, tags }] }
 * The payload has no URL field, so links are built as https://zuey.me/articles/<slug>?lang=<locale>.
 */

export type ZueyLocale = "en" | "vi";
export const ZUEY_ARTICLES_HOME_URL = "https://zuey.me/articles";
export const ZUEY_ARTICLE_LIMIT = 5;
/** The uncached list endpoint answers in about 3-4.3 s (measured 2026-10-14), so 4 s would time out most cold fetches. */
const ZUEY_FETCH_TIMEOUT_MS = 6_000;
export const zueyCacheKey = (locale: ZueyLocale) => `zuey-knowledges-v1-${locale}`;

const httpsUrl = z.string().trim().max(2048).url().refine((value) => value.startsWith("https://"), "https only");

/** Shape of one raw article as published by the API; unknown fields are stripped. */
const rawArticleSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,199}$/),
  locale: z.string().trim().regex(/^[a-z]{2}(?:-[A-Za-z]{2})?$/),
  title: z.string().trim().min(1).max(300),
  published_at: z.string().trim().datetime({ offset: true }),
  cover_url: httpsUrl.nullish(),
  reading_minutes: z.number().int().min(0).max(600).nullish(),
  access: z.string().trim().max(40).nullish(),
});

/** What the page renders; also the cached shape. */
export const zueyArticleSchema = z.object({
  title: z.string().min(1).max(300),
  url: httpsUrl,
  publishedAt: z.string().datetime({ offset: true }),
  readingMinutes: z.number().int().min(0).max(600).nullable(),
  coverUrl: httpsUrl.nullable(),
  membersOnly: z.boolean(),
});
export type ZueyArticle = z.infer<typeof zueyArticleSchema>;
export const zueyArticleListSchema = z.array(zueyArticleSchema).max(ZUEY_ARTICLE_LIMIT);

export function zueyArticlesEndpoint(locale: ZueyLocale): string {
  const url = new URL("https://zuey.me/api/v1/articles");
  url.searchParams.set("sort", "new");
  url.searchParams.set("limit", String(ZUEY_ARTICLE_LIMIT));
  url.searchParams.set("lang", locale);
  return url.toString();
}

export function zueyArticleUrl(slug: string, locale: string): string {
  const url = new URL(`https://zuey.me/articles/${encodeURIComponent(slug)}`);
  url.searchParams.set("lang", locale);
  return url.toString();
}

/** Validate the API payload; invalid articles are dropped, a malformed envelope yields an empty list. */
export function parseZueyArticles(payload: unknown): ZueyArticle[] {
  const envelope = z.object({ success: z.literal(true), data: z.array(z.unknown()) }).safeParse(payload);
  if (!envelope.success) return [];
  const articles: ZueyArticle[] = [];
  for (const item of envelope.data.data) {
    const raw = rawArticleSchema.safeParse(item);
    if (!raw.success) continue;
    const { slug, locale, title, published_at, cover_url, reading_minutes, access } = raw.data;
    articles.push({
      title,
      url: zueyArticleUrl(slug, locale),
      publishedAt: published_at,
      readingMinutes: reading_minutes ?? null,
      coverUrl: cover_url ?? null,
      membersOnly: access === "knowledges",
    });
    if (articles.length === ZUEY_ARTICLE_LIMIT) break;
  }
  return articles;
}

export async function loadZueyArticles(locale: ZueyLocale): Promise<ZueyArticle[]> {
  const body = await fetchSidebarText(zueyArticlesEndpoint(locale), "application/json", ZUEY_FETCH_TIMEOUT_MS);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("ZueyOS articles response is not valid JSON");
  }
  const articles = parseZueyArticles(payload);
  if (articles.length === 0) throw new Error("ZueyOS articles response contained no valid articles");
  return articles;
}

/** Cached entry point used by the page: `null` means no data at all (render the fallback block). */
export function getZueyArticles(locale: ZueyLocale): Promise<ZueyArticle[] | null> {
  return cachedSidebarLoad({ key: zueyCacheKey(locale), schema: zueyArticleListSchema, load: () => loadZueyArticles(locale) });
}
