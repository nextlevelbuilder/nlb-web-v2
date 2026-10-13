import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { markdownText } from "@/lib/markdown/product-markdown";
import { siteUrl } from "@/lib/seo";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { blogPostPath } from "@/lib/blog/blog-slug-rules";

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

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const baseUrl = siteUrl();
    const [products, blog] = await Promise.all([getAllPublishedProducts(), blogLines(baseUrl)]);
    const body = [
      "# Next Level Builders",
      "> A builder community and directory of human-reviewed software. Listings and rankings use published content and organic votes.",
      "## Documentation",
      `- [Build with Us](${baseUrl}/build-with-us.md): Published directory and builder workflow.`,
      `- [Builder instructions](${baseUrl}/build-with-us/instructions.md): Product documents, submission and agent integrations.`,
      `- [REST API reference](${baseUrl}/api-docs.md): Endpoints, authentication and schemas.`,
      `- [Policies](${baseUrl}/policies.md): Community and publication rules.`,
      `- [Blog](${baseUrl}/blog.md): Build logs, product lessons and engineering notes.`,
      `- [Courses](${baseUrl}/courses.md): Recorded build sessions, sold per video or included with VIP.`,
      `- [Full content](${baseUrl}/llms-full.txt): Full public pages and approved product documents, including every block.`,
      "## Languages and access",
      "English is unprefixed; Vietnamese pages use /vi. Append .md to any page URL (/.md for the home page). Private Markdown pages preserve sign-in and organization permissions and are never publicly cached.",
      "## Published products",
      ...products.map((product) => `- [${markdownText(product.title)}](${baseUrl}/products/${product.slug}.md): ${markdownText(product.tagline)} (Trust Score: ${product.trustScore}/100)`),
      ...blog,
    ].join("\n\n");
    return new Response(body + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600, s-maxage=600", "X-Robots-Tag": "noindex" } });
  } catch {
    return new Response("Published content is temporarily unavailable.\n", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
