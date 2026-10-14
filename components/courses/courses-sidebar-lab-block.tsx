import { LENSES } from "@/components/constellation/course-lenses";
import type { CoursesCopy } from "@/lib/courses/courses-copy";
import { LAB_COURSES_HOME_URL, type LabCourse } from "@/lib/courses/sidebar/fetch-200lab-courses";
import { CourseOutboundLink } from "./course-outbound-link";

/** Sidebar block: the newest 200lab courses (title, lessons, price, thumbnail), or a plain fallback link. */
export function CoursesSidebarLabBlock({ courses, copy }: { courses: LabCourse[] | null; copy: CoursesCopy }) {
  return (
    <section className="surface courses-aside-block" aria-labelledby="courses-aside-200lab">
      <p className="mono courses-kicker">200lab · {copy.labNote}</p>
      <h2 id="courses-aside-200lab" className="courses-aside-title">{copy.labHeading}</h2>
      {courses && courses.length > 0 ? (
        <>
          <ul className="courses-aside-list">
            {courses.map((course, i) => {
              const Lens = LENSES[i % LENSES.length];
              return (
                <li key={course.url}>
                  <CourseOutboundLink href={course.url} newTabLabel={copy.newTab} className="courses-aside-item">
                    <span className="lens courses-thumb" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element -- og:image lives on 200lab's asset host, not configured for next/image */}
                      {course.imageUrl ? <img src={course.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <Lens still />}
                    </span>
                    <span className="courses-aside-text">
                      <span className="courses-aside-name">{course.title}</span>
                      <span className="mono courses-aside-meta">
                        <span>{copy.labLessons(course.lessons)}</span>
                        <span>
                          <span aria-hidden="true">· </span>
                          <span className={course.priceVnd === null ? "courses-free" : undefined}>{copy.labPrice(course.priceVnd)}</span>
                        </span>
                      </span>
                    </span>
                  </CourseOutboundLink>
                </li>
              );
            })}
          </ul>
          <CourseOutboundLink href={LAB_COURSES_HOME_URL} newTabLabel={copy.newTab} className="link-arrow courses-aside-all">
            {copy.labAll} <span aria-hidden="true">↗</span>
          </CourseOutboundLink>
        </>
      ) : (
        <p className="courses-aside-fallback">
          {copy.labFallback}{" "}
          <CourseOutboundLink href={LAB_COURSES_HOME_URL} newTabLabel={copy.newTab} className="link-arrow">
            {copy.labFallbackLink} <span aria-hidden="true">↗</span>
          </CourseOutboundLink>
        </p>
      )}
    </section>
  );
}
