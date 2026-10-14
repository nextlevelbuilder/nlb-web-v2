/**
 * Loads the Constellation brand faces for next/og social cards.
 *
 * Satori needs raw TTF/OTF bytes. Google Fonts serves TTF to clients without a modern browser
 * user agent, and the `text=` parameter subsets the face to exactly the glyphs on the card, which
 * covers Vietnamese diacritics without shipping whole font files in the Worker bundle.
 * Failures are non-fatal: the card falls back to next/og's bundled sans face.
 */

export type OgFontWeight = 400 | 500 | 600;
export type OgFontStyle = "normal" | "italic";

export interface OgFontRequest {
  /** Name used in the card's `fontFamily` styles. */
  name: string;
  /** Google Fonts family, e.g. "Cormorant Garamond". */
  family: string;
  weight: OgFontWeight;
  style: OgFontStyle;
}

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: OgFontWeight;
  style: OgFontStyle;
}

const FETCH_TIMEOUT_MS = 2500;
const MAX_TEXT_LENGTH = 2000;
/** Bound the cache: every card has its own subset, so evict everything once it grows past this. */
const MAX_CACHED_FACES = 96;

/** Isolate-lifetime cache keyed by family, axis and subset text; social crawlers refetch the same cards. */
const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

/** Google Fonts css2 URL for one face, subset to the given text. Exported for tests. */
export function googleFontCssUrl({ family, weight, style }: Omit<OgFontRequest, "name">, text: string): string {
  const axis = style === "italic" ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const params = new URLSearchParams({ family: `${family}:${axis}`, text: uniqueGlyphs(text) });
  return `https://fonts.googleapis.com/css2?${params.toString().replace(/%3A/g, ":").replace(/%40/g, "@").replace(/%2C/g, ",")}`;
}

/** Deduplicated glyph set (plus digits and basic punctuation used by the card chrome), capped in length. */
export function uniqueGlyphs(text: string): string {
  return [...new Set(`${text}0123456789·—–-:/.,'’ `)].join("").slice(0, MAX_TEXT_LENGTH);
}

/** Extracts the first TrueType/OpenType source URL from a css2 stylesheet. Exported for tests. */
export function fontUrlFromCss(css: string): string | null {
  const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(truetype|opentype)['"]?\)/);
  return match ? match[1].replace(/^['"]|['"]$/g, "") : null;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function loadFace(request: OgFontRequest, text: string): Promise<ArrayBuffer | null> {
  try {
    const cssResponse = await fetchWithTimeout(googleFontCssUrl(request, text));
    if (!cssResponse.ok) return null;
    const fontUrl = fontUrlFromCss(await cssResponse.text());
    if (!fontUrl) return null;
    const fontResponse = await fetchWithTimeout(fontUrl);
    return fontResponse.ok ? await fontResponse.arrayBuffer() : null;
  } catch {
    // Network error or timeout: render with the bundled face rather than failing the card.
    return null;
  }
}

/** Resolves every requested face that loaded; missing faces are skipped. */
export async function loadOgFonts(requests: OgFontRequest[], text: string): Promise<OgFont[]> {
  const glyphs = uniqueGlyphs(text);
  const loaded = await Promise.all(
    requests.map(async (request) => {
      const key = `${request.family}|${request.weight}|${request.style}|${glyphs}`;
      let pending = fontCache.get(key);
      if (!pending) {
        if (fontCache.size >= MAX_CACHED_FACES) fontCache.clear();
        pending = loadFace(request, glyphs);
        fontCache.set(key, pending);
        // Do not pin failures: the next request retries.
        pending.then((data) => { if (!data) fontCache.delete(key); }).catch(() => fontCache.delete(key));
      }
      const data = await pending;
      return data ? { name: request.name, data, weight: request.weight, style: request.style } : null;
    }),
  );
  return loaded.filter((font): font is OgFont => font !== null);
}
