import type { PublicCourseVideo } from "./course-video-service";

/** Search, sort, filter and pagination of the /courses catalogue, driven by `?q=&sort=&speaker=&transcript=1&page=`. */

export const CATALOGUE_PAGE_SIZE = 12;
export const CATALOGUE_SORTS = ["newest", "oldest", "longest", "shortest"] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

export interface CatalogueQuery {
  q: string;
  sort: CatalogueSort;
  speaker: string;
  transcript: boolean;
  page: number;
}

export interface CataloguePage {
  items: PublicCourseVideo[];
  /** Videos matching the filters, across all pages. */
  matched: number;
  page: number;
  pageCount: number;
  speakers: string[];
}

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function parseCatalogueQuery(params: Params): CatalogueQuery {
  const sort = first(params.sort);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    sort: (CATALOGUE_SORTS as readonly string[]).includes(sort) ? (sort as CatalogueSort) : "newest",
    speaker: first(params.speaker).trim().slice(0, 100),
    transcript: first(params.transcript) === "1",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** True when the visitor narrowed or reordered the list (the feature card only shows on the default view). */
export function isDefaultCatalogueView(query: CatalogueQuery): boolean {
  return !query.q && !query.speaker && !query.transcript && query.sort === "newest" && query.page === 1;
}

/** `/courses` query string for a view, omitting defaults. */
export function catalogueSearch(query: CatalogueQuery, page = query.page): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (query.speaker) params.set("speaker", query.speaker);
  if (query.transcript) params.set("transcript", "1");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Speaker from the description's last line, "Diễn giả: <name> · YYYY-MM-DD" (or "Speaker: …"). */
export function speakerOf(description: string): string | null {
  const match = /(?:Diễn giả|Speakers?)\s*:\s*([^·\n]+?)\s*(?:·|$)/imu.exec(description);
  return match ? match[1].trim() : null;
}

/** Lowercase without Vietnamese diacritics, so "cong ty" finds "công ty". */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

const byWeekDesc = (a: PublicCourseVideo, b: PublicCourseVideo) =>
  (b.weekNumber ?? -1) - (a.weekNumber ?? -1) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");

const SORTERS: Record<CatalogueSort, (a: PublicCourseVideo, b: PublicCourseVideo) => number> = {
  newest: byWeekDesc,
  oldest: (a, b) => byWeekDesc(b, a),
  longest: (a, b) => b.durationSec - a.durationSec || byWeekDesc(a, b),
  shortest: (a, b) => a.durationSec - b.durationSec || byWeekDesc(a, b),
};

export function queryCatalogue(videos: PublicCourseVideo[], query: CatalogueQuery, pageSize = CATALOGUE_PAGE_SIZE): CataloguePage {
  const speakers = [...new Set(videos.map((v) => speakerOf(v.description)).filter((s): s is string => Boolean(s)))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );
  const terms = foldText(query.q).split(/\s+/).filter(Boolean);
  const speaker = foldText(query.speaker);
  const matched = videos
    .filter((v) => !query.transcript || v.hasTranscript)
    .filter((v) => !speaker || foldText(speakerOf(v.description) ?? "") === speaker)
    .filter((v) => {
      if (!terms.length) return true;
      const haystack = foldText(`${v.weekNumber ?? ""} ${v.title} ${v.description}`);
      return terms.every((term) => haystack.includes(term));
    })
    .sort(SORTERS[query.sort]);
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return { items: matched.slice((page - 1) * pageSize, page * pageSize), matched: matched.length, page, pageCount, speakers };
}
