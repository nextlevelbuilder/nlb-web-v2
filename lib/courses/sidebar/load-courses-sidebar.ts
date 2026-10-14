import { getFeaturedLabCourses, type LabCourse } from "./fetch-200lab-courses";
import { getZueyArticles, type ZueyArticle, type ZueyLocale } from "./fetch-zuey-knowledges";

export interface CoursesSidebarData {
  /** `null` when the source is unavailable and nothing is cached. */
  labCourses: LabCourse[] | null;
  articles: ZueyArticle[] | null;
}

/** Load both sidebar feeds in parallel. Never rejects: a failed source becomes `null`. */
export async function loadCoursesSidebar(locale: ZueyLocale): Promise<CoursesSidebarData> {
  const [labCourses, articles] = await Promise.allSettled([getFeaturedLabCourses(), getZueyArticles(locale)]);
  if (labCourses.status === "rejected") console.error("[courses-sidebar] 200lab courses failed:", labCourses.reason);
  if (articles.status === "rejected") console.error("[courses-sidebar] ZueyOS articles failed:", articles.reason);
  return {
    labCourses: labCourses.status === "fulfilled" ? labCourses.value : null,
    articles: articles.status === "fulfilled" ? articles.value : null,
  };
}
