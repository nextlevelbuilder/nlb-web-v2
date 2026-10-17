import { NextResponse } from "next/server";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { publishedDocument } from "@/lib/domain/published-document";
import { productMarkdown } from "@/lib/markdown/product-markdown";
import { siteUrl } from "@/lib/seo";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const result = await getPublishedProductBySlug(slug);
  if (!result) return new NextResponse("Product not found or not published", { status: 404 });
  const { product, revision } = result;
  const document = publishedDocument(revision);
  const canonical = `${siteUrl()}/products/${slug}`;
  const markdown = productMarkdown(document, canonical) + `\nTrust Score: ${product.trustScore}/100\n\nOrganic votes: ${product.votesCount}\n\nContent hash: \`${revision.contentHash}\`\n`;
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
      "X-Content-Type-Options": "nosniff",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
}
