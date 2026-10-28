import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { markdownText } from "@/lib/markdown/product-markdown";
import { siteUrl } from "@/lib/seo";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { blogPostPath } from "@/lib/blog/blog-slug-rules";
import { listPublishedVideos } from "@/lib/courses/course-video-service";
import { getDb } from "@/lib/db";
import { DISCOVERY_PATHS, mcpEndpoint } from "@/lib/discovery/agent-discovery-documents";
import { publicWrappedPaths } from "@/lib/builder-league/public-surfaces";
import { publicHallOfFamePaths } from "@/lib/builder-league/hall-of-fame";

/** Latest published blog posts in both locales; the blog is optional here, so failures only drop the section. */
async function blogLines(baseUrl: string): Promise<string[]> {
  try {
    const posts = await listPostSummaries({ status: "published", limit: 50, offset: 0 });
    if (!posts.length) return [];
    return ["## Blog", ...posts.map((post) => `- [${markdownText(post.title)}](${baseUrl}${blogPostPath(post.locale, post.slug)}.md) (${post.locale})${post.description ? `: ${markdownText(post.description)}` : ""}`)];
  } catch (error) {
    console.error("llms.txt: blog posts unavailable", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Published course videos; optional like the blog. */
async function courseLines(baseUrl: string): Promise<string[]> {
  try {
    const videos = await listPublishedVideos(getDb());
    if (!videos.length) return [];
    return ["## Course videos", ...videos.map((video) => `- [${markdownText(video.title)}](${baseUrl}/courses/${video.slug}.md)${video.description ? `: ${markdownText(video.description)}` : ""}`)];
  } catch (error) {
    console.error("llms.txt: course videos unavailable", error instanceof Error ? error.message : error);
    return [];
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const baseUrl = siteUrl();
    const [products, blog, courses] = await Promise.all([getAllPublishedProducts(), blogLines(baseUrl), courseLines(baseUrl)]);
    const body = [
      "# Next Level Builders",
      "> A builder community and directory of human-reviewed software. Listings and rankings use published content and organic votes.",
      "## Documentation",
      `- [Home](${baseUrl}/index.md): Membership, founders, courses, the directory and pricing in one page.`,
      `- [Build with Us](${baseUrl}/build-with-us.md): Published directory and builder workflow.`,
      `- [Builder instructions](${baseUrl}/build-with-us/instructions.md): Product documents, submission and agent integrations.`,
      `- [REST API reference](${baseUrl}/api-docs.md): Endpoints, authentication and schemas.`,
      `- [Leaderboards](${baseUrl}/leaderboards.md): Daily, weekly and monthly rankings from organic votes.`,
      `- [Policies](${baseUrl}/policies.md): Community and publication rules.`,
      ...publicWrappedPaths().map((path) => `- [Community Wrapped ${path.slice(-4)}](${baseUrl}${path}.md): What the community validated, built and shipped that year, from verified activity only.`),
      ...publicHallOfFamePaths().map((path) => `- [Builder League Hall of Fame ${path.slice(9, 13)}](${baseUrl}${path}.md): Official final results of that year's boards; only builders who opted in to public boards are named.`),
      `- [Blog](${baseUrl}/blog.md): Build logs, product lessons and engineering notes.`,
      `- [Courses](${baseUrl}/courses.md): Recorded build sessions, sold per video or included with VIP.`,
      `- [Full content](${baseUrl}/llms-full.txt): Full public pages and approved product documents, including every block.`,
      "## Agent interfaces",
      `- MCP server (streamable HTTP, MCP 2026-07-28 with 2025 fallback, OAuth 2.1 or API key): ${mcpEndpoint()}`,
      `- [MCP server card](${baseUrl}${DISCOVERY_PATHS.serverCard}): Server identity, transports, auth and links.`,
      `- [AI catalog](${baseUrl}${DISCOVERY_PATHS.aiCatalog}): Every AI-facing interface of this domain.`,
      `- [OpenAPI](${baseUrl}${DISCOVERY_PATHS.openApi}): REST API description; [API catalog](${baseUrl}${DISCOVERY_PATHS.apiCatalog}) (RFC 9727).`,
      "- CLI: `npx @nextlevelbuilder/cli` (validate, preview and submit product.json). Local MCP: `npx -y @nextlevelbuilder/mcp`.",
      "## Languages and access",
      "English is unprefixed; Vietnamese pages use /vi. Append .md to any page URL (/index.md for the home page, /vi.md for the Vietnamese home). Private Markdown pages preserve sign-in and organization permissions and are never publicly cached.",
      "## Published products",
      ...products.map((product) => `- [${markdownText(product.title)}](${baseUrl}/products/${product.slug}.md): ${markdownText(product.tagline)} (Trust Score: ${product.trustScore}/100)`),
      ...courses,
      ...blog,
    ].join("\n\n");
    return new Response(body + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600, s-maxage=600", "X-Robots-Tag": "noindex" } });
  } catch {
    return new Response("Published content is temporarily unavailable.\n", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
