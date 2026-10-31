import { MetadataRoute } from "next";
import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { blogPostPath } from "@/lib/blog/blog-slug-rules";
import { listPublishedVideos } from "@/lib/courses/course-video-service";
import { getDb } from "@/lib/db";
import { publishedPolicySlugs } from "@/lib/policies/published-policies";
import { getPolicy } from "@/content/policies";
import { localizedPath, siteUrl } from "@/lib/seo";
import { publicWrappedPaths } from "@/lib/builder-league/public-surfaces";
import { isLiveEnabled } from "@/lib/live/live-flag";
import { isAffiliatesEnabled } from "@/lib/referrals/referral-env";
import { listPastEvents, listUpcomingEvents } from "@/lib/live/event-read-models";
import { publicHallOfFamePaths } from "@/lib/builder-league/hall-of-fame";

export const dynamic = "force-dynamic";

/** A failing optional source (blog, courses) drops its entries instead of breaking the sitemap. */
async function safely<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    console.error("sitemap source failed", error);
    return [];
  }
}

/** Latest of the given dates, or undefined when there is none (no invented lastmod). */
function latest(dates: Array<Date | string | null | undefined>): Date | undefined {
  const times = dates.map((value) => (value ? new Date(value).getTime() : NaN)).filter((time) => Number.isFinite(time));
  return times.length ? new Date(Math.max(...times)) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl();
  const products = await getAllPublishedProducts();
  const posts = await safely(() => listPostSummaries({ status: "published", limit: 500, offset: 0 }));
  const videos = await safely(() => listPublishedVideos(getDb()));
  // NLB Live pages exist only while the flag is on (production keeps it off).
  const liveOn = isLiveEnabled();
  const liveEvents = liveOn
    ? await safely(async () => {
        const now = new Date();
        const [upcoming, past] = await Promise.all([listUpcomingEvents(getDb(), now, 100), listPastEvents(getDb(), now, 100)]);
        return [...upcoming, ...past];
      })
    : [];
  // Listing pages take the newest change of the content they list; policies carry their own review date.
  const productsChanged = latest(products.map((product) => product.updatedAt));
  const videosChanged = latest(videos.map((video) => video.updatedAt));
  const postsChanged = latest(posts.map((post) => post.updatedAt));
  const policySlugs = publishedPolicySlugs();
  const policyDates = new Map(policySlugs.map((slug) => [slug, latest([getPolicy(slug, "en")?.lastUpdated])]));
  const policiesChanged = latest([...policyDates.values()]);
  const staticPages: Array<[string, Date | undefined]> = [
    ["/", latest([productsChanged, videosChanged, postsChanged])],
    ["/build-with-us", productsChanged],
    ["/leaderboards", productsChanged],
    ["/blog", postsChanged],
    ["/courses", videosChanged],
    ["/policies", policiesChanged],
    ...policySlugs.map((slug): [string, Date | undefined] => [`/policies/${slug}`, policyDates.get(slug)]),
  ];
  const entries: MetadataRoute.Sitemap = [];
  const add = (path: string, lastModified?: Date) => {
    for (const locale of ["en", "vi"]) entries.push({
      url: `${baseUrl}${localizedPath(path, locale)}`,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages: { en: `${baseUrl}${localizedPath(path, "en")}`, vi: `${baseUrl}${localizedPath(path, "vi")}`, "x-default": `${baseUrl}${localizedPath(path, "en")}` } },
    });
  };
  for (const [path, lastModified] of staticPages) add(path, lastModified);
  // Community Wrapped, only while the Builder League is public (flag on).
  for (const path of publicWrappedPaths()) add(path);
  // Annual Hall of Fame of completed years, under the same flag.
  for (const path of publicHallOfFamePaths()) add(path);
  entries.push({ url: `${baseUrl}/api-docs` });
  for (const product of products) add(`/products/${product.slug}`, product.updatedAt);
  for (const video of videos) add(`/courses/${video.slug}`, video.updatedAt);
  if (liveOn) add("/live");
  for (const event of liveEvents) add(`/live/${event.slug}`);
  // The affiliate program landing exists only while the program flag is on.
  if (isAffiliatesEnabled()) add("/affiliates", policyDates.get("affiliate-agreement"));
  // Blog posts are single-locale documents; translations are linked through hreflang on the page.
  for (const post of posts) entries.push({ url: `${baseUrl}${blogPostPath(post.locale, post.slug)}`, lastModified: new Date(post.updatedAt) });
  return entries;
}
