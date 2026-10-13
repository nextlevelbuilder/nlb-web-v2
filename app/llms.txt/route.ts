import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { markdownText } from "@/lib/markdown/product-markdown";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const baseUrl = siteUrl();
    const products = await getAllPublishedProducts();
    const body = [
      "# Next Level Builders",
      "> A builder community and directory of human-reviewed software. Listings and rankings use published content and organic votes.",
      "## Documentation",
      `- [Build with Us](${baseUrl}/build-with-us.md): Published directory and builder workflow.`,
      `- [Builder instructions](${baseUrl}/build-with-us/instructions.md): Product documents, submission and agent integrations.`,
      `- [REST API reference](${baseUrl}/api-docs.md): Endpoints, authentication and schemas.`,
      `- [Policies](${baseUrl}/policies.md): Community and publication rules.`,
      `- [Full content](${baseUrl}/llms-full.txt): Full public pages and approved product documents, including every block.`,
      "## Languages and access",
      "Vietnamese is unprefixed; English pages use /en. Append .md to any page URL (/.md for the home page). Private Markdown pages preserve sign-in and organization permissions and are never publicly cached.",
      "## Published products",
      ...products.map((product) => `- [${markdownText(product.title)}](${baseUrl}/products/${product.slug}.md): ${markdownText(product.tagline)} (Trust Score: ${product.trustScore}/100)`),
    ].join("\n\n");
    return new Response(body + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600, s-maxage=600" } });
  } catch {
    return new Response("Published content is temporarily unavailable.\n", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
