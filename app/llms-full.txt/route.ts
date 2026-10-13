import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { POLICY_SLUGS } from "@/lib/constants/policy-slugs";
import { fetchPageMarkdown } from "@/lib/markdown/page-markdown";
import { productMarkdown } from "@/lib/markdown/product-markdown";
import { localizedPath, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const origin = siteUrl();
    const products = await getAllPublishedProducts();
    const paths = ["/", "/build-with-us", "/build-with-us/instructions", "/leaderboards", "/policies", ...POLICY_SLUGS.map((slug) => `/policies/${slug}`)];
    const localized = paths.flatMap((path) => [localizedPath(path, "vi"), localizedPath(path, "en")]);
    localized.push("/api-docs");
    const sections = ["# Next Level Builders — Full published content"];
    // Keep subrequest concurrency bounded for the Worker runtime.
    for (let offset = 0; offset < localized.length; offset += 3) {
      const batch = await Promise.all(localized.slice(offset, offset + 3).map((path) => fetchPageMarkdown(origin, path, "", new Headers())));
      if (batch.some((page) => page.status !== 200)) throw new Error("Public page unavailable");
      sections.push(...batch.map((page) => page.body));
    }
    sections.push(...products.map((product) => productMarkdown(product.publishedDocument, `${origin}/products/${product.slug}`) + `\nTrust Score: ${product.trustScore}/100\n\nOrganic votes: ${product.votesCount}\n`));
    return new Response(sections.join("\n\n---\n\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600, s-maxage=600", "X-Robots-Tag": "noindex" } });
  } catch {
    return new Response("Full published content is temporarily unavailable.\n", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
