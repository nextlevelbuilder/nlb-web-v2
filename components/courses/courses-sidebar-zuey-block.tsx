import { LensBinary } from "@/components/constellation/course-lenses";
import type { CoursesCopy } from "@/lib/courses/courses-copy";
import { ZUEY_ARTICLES_HOME_URL, type ZueyArticle } from "@/lib/courses/sidebar/fetch-zuey-knowledges";
import { CourseOutboundLink } from "./course-outbound-link";

function formatArticleDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Saigon",
  }).format(new Date(iso));
}

/** Sidebar block: the latest ZueyOS articles with date, reading time and a members badge. */
export function CoursesSidebarZueyBlock({ articles, copy, locale }: { articles: ZueyArticle[] | null; copy: CoursesCopy; locale: string }) {
  return (
    <section className="surface courses-aside-block" aria-labelledby="courses-aside-zuey">
      <p className="mono courses-kicker">zuey.me · {copy.zueyNote}</p>
      <h2 id="courses-aside-zuey" className="courses-aside-title">{copy.zueyHeading}</h2>
      {articles && articles.length > 0 ? (
        <>
          <ul className="courses-aside-list">
            {articles.map((article) => (
              <li key={article.url}>
                <CourseOutboundLink href={article.url} newTabLabel={copy.newTab} className="courses-aside-item">
                  <span className="lens courses-thumb" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element -- article covers live on several third-party hosts */}
                    {article.coverUrl ? <img src={article.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <LensBinary still />}
                  </span>
                  <span className="courses-aside-text">
                    <span className="courses-aside-name">{article.title}</span>
                    <span className="mono courses-aside-meta">
                      <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt, locale)}</time>
                      {article.readingMinutes !== null && article.readingMinutes > 0 && (
                        <span><span aria-hidden="true">· </span>{copy.readingMinutes(article.readingMinutes)}</span>
                      )}
                      {article.membersOnly && <span className="courses-members">{copy.membersBadge}</span>}
                    </span>
                  </span>
                </CourseOutboundLink>
              </li>
            ))}
          </ul>
          <CourseOutboundLink href={ZUEY_ARTICLES_HOME_URL} newTabLabel={copy.newTab} className="link-arrow courses-aside-all">
            {copy.zueyAll} <span aria-hidden="true">↗</span>
          </CourseOutboundLink>
        </>
      ) : (
        <p className="courses-aside-fallback">
          {copy.zueyFallback}{" "}
          <CourseOutboundLink href={ZUEY_ARTICLES_HOME_URL} newTabLabel={copy.newTab} className="link-arrow">
            {copy.zueyFallbackLink} <span aria-hidden="true">↗</span>
          </CourseOutboundLink>
        </p>
      )}
    </section>
  );
}
