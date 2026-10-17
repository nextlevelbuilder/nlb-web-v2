import { z } from "zod";
import { cachedSidebarLoad } from "./sidebar-cache";
import { fetchSidebarText } from "./sidebar-http";

/**
 * Featured courses from 200lab, read from its public markdown index (https://200lab.io/courses.md).
 * Each course is one bullet:
 *   - [<title>](https://200lab.io/courses/<slug>.md): <description> · <N> bài học · <Miễn phí | Đang mở bán, giá từ 139.000 ₫>
 * Thumbnails are not in the index; they come best-effort from each course page's `og:image`.
 */

export const LAB_COURSES_INDEX_URL = "https://200lab.io/courses.md";
export const LAB_COURSES_HOME_URL = "https://200lab.io/courses";
export const LAB_COURSES_CACHE_KEY = "200lab-courses-v1";
export const LAB_FEATURED_COUNT = 4;

const httpsUrl = z.string().trim().max(2048).url().refine((value) => value.startsWith("https://"), "https only");

export const labCourseSchema = z.object({
  title: z.string().trim().min(1).max(240),
  url: httpsUrl.refine((value) => /^https:\/\/200lab\.io\/courses\/[a-z0-9-]+$/.test(value), "200lab course URL"),
  description: z.string().trim().max(800),
  lessons: z.number().int().min(1).max(2000),
  /** "From" price in VND; `null` when the course is free. */
  priceVnd: z.number().int().min(1).max(1_000_000_000).nullable(),
  imageUrl: httpsUrl.nullable(),
});
export type LabCourse = z.infer<typeof labCourseSchema>;
export const labCourseListSchema = z.array(labCourseSchema).max(LAB_FEATURED_COUNT);

/**
 * Title is matched up to the `](https://200lab.io/courses/...md)` link target, so ` - ` and quotes in a
 * title are harmless. The description is greedy, which anchors the lesson/price fields on the LAST
 * ` · ` separators of the line.
 */
const LINE_RE = /^\s*[-*]\s+\[(.+)\]\((https:\/\/200lab\.io\/courses\/[a-z0-9-]+)\.md\):\s*(.*)\s·\s(\d{1,4})\s+bài học\s·\s(.+?)\s*$/u;
const FREE_RE = /^miễn phí$/iu;
const PRICE_RE = /giá từ\s+(\d{1,3}(?:\.\d{3})+|\d{1,10})\s*₫$/u;

function parsePrice(status: string): number | null | undefined {
  if (FREE_RE.test(status.trim())) return null;
  const match = PRICE_RE.exec(status);
  if (!match) return undefined;
  const value = Number(match[1].replace(/\./g, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Parse the markdown index into validated courses (without images). Malformed lines are skipped. */
export function parseLabCoursesMarkdown(markdown: string): LabCourse[] {
  const courses: LabCourse[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = LINE_RE.exec(line);
    if (!match) continue;
    const [, title, url, description, lessons, status] = match;
    const priceVnd = parsePrice(status);
    if (priceVnd === undefined) continue;
    const parsed = labCourseSchema.safeParse({ title, url, description: description.trim().slice(0, 800), lessons: Number(lessons), priceVnd, imageUrl: null });
    if (parsed.success) courses.push(parsed.data);
  }
  return courses;
}

const META_TAG_RE = /<meta\b[^>]*>/giu;
const ATTR_RE = /([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/giu;

function decodeAttribute(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
}

/** Extract the `og:image` URL from an HTML document; only absolute https URLs are accepted. */
export function extractOgImage(html: string): string | null {
  for (const tag of html.match(META_TAG_RE) ?? []) {
    const attrs = new Map<string, string>();
    for (const attr of tag.matchAll(ATTR_RE)) attrs.set(attr[1].toLowerCase(), decodeAttribute(attr[3] ?? attr[4] ?? ""));
    const name = attrs.get("property") ?? attrs.get("name");
    if (name?.toLowerCase() !== "og:image") continue;
    const parsed = httpsUrl.safeParse(attrs.get("content") ?? "");
    return parsed.success ? parsed.data : null;
  }
  return null;
}

async function fetchOgImage(courseUrl: string): Promise<string | null> {
  try {
    return extractOgImage(await fetchSidebarText(courseUrl, "text/html"));
  } catch (error) {
    console.error(`[courses-sidebar] og:image lookup failed for ${courseUrl}:`, error);
    return null;
  }
}

/** Fetch the index, keep the newest featured courses and attach their thumbnails (best effort). */
export async function loadFeaturedLabCourses(): Promise<LabCourse[]> {
  const featured = parseLabCoursesMarkdown(await fetchSidebarText(LAB_COURSES_INDEX_URL, "text/markdown, text/plain;q=0.9")).slice(0, LAB_FEATURED_COUNT);
  if (featured.length === 0) throw new Error("200lab index contained no parseable courses");
  const images = await Promise.all(featured.map((course) => fetchOgImage(course.url)));
  return featured.map((course, i) => ({ ...course, imageUrl: images[i] }));
}

/** Cached entry point used by the page: `null` means no data at all (render the fallback block). */
export function getFeaturedLabCourses(): Promise<LabCourse[] | null> {
  return cachedSidebarLoad({ key: LAB_COURSES_CACHE_KEY, schema: labCourseListSchema, load: loadFeaturedLabCourses });
}
