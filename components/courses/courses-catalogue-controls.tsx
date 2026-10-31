import Link from "next/link";
import { CATALOGUE_SORTS, catalogueSearch, type CatalogueQuery } from "@/lib/courses/course-catalogue";
import type { CoursesCopy } from "@/lib/courses/courses-copy";

/**
 * Search, sort and filters for /courses as a plain GET form: the server renders the result, so it
 * works without JavaScript and every view has a shareable URL. Submitting always returns to page 1.
 */
export function CoursesCatalogueControls({
  action,
  query,
  speakers,
  copy,
  filtered,
}: {
  action: string;
  query: CatalogueQuery;
  speakers: string[];
  copy: CoursesCopy;
  filtered: boolean;
}) {
  return (
    <form method="get" action={action} role="search" aria-label={copy.controlsLabel} className="courses-controls">
      <div className="courses-control courses-control-search">
        <label htmlFor="courses-q" className="mono courses-control-label">{copy.searchLabel}</label>
        <input id="courses-q" name="q" type="search" maxLength={100} autoComplete="off" placeholder={copy.searchPlaceholder} defaultValue={query.q} />
      </div>
      <div className="courses-control">
        <label htmlFor="courses-sort" className="mono courses-control-label">{copy.sortLabel}</label>
        <select id="courses-sort" name="sort" defaultValue={query.sort}>
          {CATALOGUE_SORTS.map((sort) => (
            <option key={sort} value={sort}>{copy.sorts[sort]}</option>
          ))}
        </select>
      </div>
      {speakers.length > 1 && (
        <div className="courses-control">
          <label htmlFor="courses-speaker" className="mono courses-control-label">{copy.speakerLabel}</label>
          <select id="courses-speaker" name="speaker" defaultValue={query.speaker}>
            <option value="">{copy.allSpeakers}</option>
            {speakers.map((speaker) => (
              <option key={speaker} value={speaker}>{speaker}</option>
            ))}
          </select>
        </div>
      )}
      <div className="courses-controls-row">
        <label className="courses-check">
          <input type="checkbox" name="transcript" value="1" defaultChecked={query.transcript} />
          <span>{copy.transcriptFilter}</span>
        </label>
        <button type="submit" className="btn btn-primary btn-sm">{copy.applyFilters}</button>
        {filtered && <Link className="link-arrow courses-clear" href={action}>{copy.clearFilters}</Link>}
      </div>
    </form>
  );
}

/** Numbered pages with previous/next; links keep the current search and filters. */
export function CoursesPagination({ action, query, page, pageCount, copy }: { action: string; query: CatalogueQuery; page: number; pageCount: number; copy: CoursesCopy }) {
  if (pageCount <= 1) return null;
  const href = (n: number) => `${action}${catalogueSearch(query, n)}`;
  return (
    <nav className="courses-pagination" aria-label={copy.paginationLabel}>
      {page > 1 ? (
        <Link className="btn btn-ghost btn-sm" href={href(page - 1)} rel="prev"><span aria-hidden="true">←</span> {copy.prevPage}</Link>
      ) : <span />}
      <ol className="courses-pages">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <Link className="courses-page-link mono" href={href(n)} aria-label={copy.goToPage(n)} aria-current={n === page ? "page" : undefined}>{n}</Link>
          </li>
        ))}
      </ol>
      <span className="mono courses-page-of">{copy.pageOf(page, pageCount)}</span>
      {page < pageCount ? (
        <Link className="btn btn-ghost btn-sm" href={href(page + 1)} rel="next">{copy.nextPage} <span aria-hidden="true">→</span></Link>
      ) : <span />}
    </nav>
  );
}
