import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { POLICY_SLUGS } from "@/lib/constants/policy-slugs";
import { fetchPageMarkdown } from "@/lib/markdown/page-markdown";
import { productMarkdown } from "@/lib/markdown/product-markdown";
import { localizedPath, siteUrl } from "@/lib/seo";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { blogPostPath } from "@/lib/blog/blog-slug-rules";
import { listPublishedVideos } from "@/lib/courses/course-video-service";
import { getDb } from "@/lib/db";
import { publicWrappedPaths } from "@/lib/builder-league/public-surfaces";
import { isLiveEnabled } from "@/lib/live/live-flag";
import { publicHallOfFamePaths } from "@/lib/builder-league/hall-of-fame";

/** Optional sources (blog, courses) drop out on failure instead of failing the whole document. */
async function optional<T>(label: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    console.error(`llms-full.txt: ${label} unavailable`, error instanceof Error ? error.message : error);
    return [];
  }
}

const MAX_POSTS = 40;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const origin = siteUrl();
    const [products, posts, videos] = await Promise.all([
      getAllPublishedProducts(),
      optional("blog posts", () => listPostSummaries({ status: "published", limit: MAX_POSTS, offset: 0 })),
      optional("course videos", () => listPublishedVideos(getDb())),
    ]);
    const paths = ["/", "/build-with-us", "/build-with-us/instructions", "/leaderboards", "/courses", "/blog", "/policies", ...POLICY_SLUGS.map((slug) => `/policies/${slug}`), ...videos.map((video) => `/courses/${video.slug}`)];
    const localized = paths.flatMap((path) => [localizedPath(path, "vi"), localizedPath(path, "en")]);
    localized.push("/api-docs");
    // Posts are single-locale documents, so each appears once under its own path.
    const optionalPages = new Set(posts.map((post) => blogPostPath(post.locale, post.slug)));
    // Community Wrapped and Hall of Fame pages (flag on only) are optional too: a failing year never fails the document.
    for (const path of [...publicWrappedPaths(), ...publicHallOfFamePaths()]) for (const locale of ["vi", "en"]) optionalPages.add(localizedPath(path, locale));
    // NLB Live (flag on only) is optional as well.
    if (isLiveEnabled()) for (const locale of ["vi", "en"]) optionalPages.add(localizedPath("/live", locale));
    localized.push(...optionalPages);
    const sections = ["# Next Level Builders — Full published content"];
    // Keep subrequest concurrency bounded for the Worker runtime.
    for (let offset = 0; offset < localized.length; offset += 3) {
      const batch = await Promise.all(localized.slice(offset, offset + 3).map((path) => fetchPageMarkdown(origin, path, "", new Headers())));
      const paths = localized.slice(offset, offset + 3);
      // Core pages must render; a post that fails (e.g. unpublished mid-request) is skipped.
      if (batch.some((page, index) => page.status !== 200 && !optionalPages.has(paths[index]))) throw new Error("Public page unavailable");
      sections.push(...batch.filter((page) => page.status === 200).map((page) => page.body));
    }
    sections.push(...products.map((product) => productMarkdown(product.publishedDocument, `${origin}/products/${product.slug}`) + `\nTrust Score: ${product.trustScore}/100\n\nOrganic votes: ${product.votesCount}\n`));
    return new Response(sections.join("\n\n---\n\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600, s-maxage=600", "X-Robots-Tag": "noindex" } });
  } catch {
    return new Response("Full published content is temporarily unavailable.\n", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
