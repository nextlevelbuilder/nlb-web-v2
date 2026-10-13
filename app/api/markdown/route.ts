import { markdownSourcePath } from "@/lib/markdown/page-paths";
import { fetchPageMarkdown } from "@/lib/markdown/page-markdown";
import { productMarkdown } from "@/lib/markdown/product-markdown";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { localizedPath, siteUrl } from "@/lib/seo";
import { publishedDocument } from "@/lib/domain/published-document";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  // Next can retain the browser URL on a middleware rewrite. Support both that
  // original URL and the internal route's explicit path parameter.
  const isRewrittenPage = requestUrl.pathname.endsWith(".md");
  const source = markdownSourcePath(isRewrittenPage ? requestUrl.pathname : requestUrl.searchParams.get("path") || "");
  const responseHeaders = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Vary": "Cookie, Authorization, Accept-Language",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  };
  if (!source) return new Response("# Not found\n", { status: 404, headers: responseHeaders });
  const isApiReference = ["/api-docs", "/api/docs", "/docs/api"].includes(source.path);
  const canonicalPath = source.path.replace(/^\/profile\//, "/builders/");
  const canonical = `${siteUrl()}${isApiReference ? "/api-docs" : localizedPath(canonicalPath, source.locale)}`;
  const headers = { ...responseHeaders, Link: `<${canonical}>; rel="canonical"` };
  try {
    const productMatch = source.path.match(/^\/products\/([^/]+)$/);
    if (productMatch) {
      const result = await getPublishedProductBySlug(productMatch[1]);
      if (!result) return new Response("# Not found\n", { status: 404, headers });
      const document = publishedDocument(result.revision);
      const body = productMarkdown(document, canonical) + `\nTrust Score: ${result.product.trustScore}/100\n\nOrganic votes: ${result.product.votesCount}\n`;
      return new Response(body, { headers });
    }
    // A configured origin, never Host/X-Forwarded-Host or a caller-supplied URL.
    // This prevents cookie forwarding to arbitrary destinations.
    // The middleware passes the visitor's query as `query`; a retained `.md` URL without it keeps its own search.
    const query = requestUrl.searchParams.has("path") ? requestUrl.searchParams.get("query") || "" : isRewrittenPage ? requestUrl.search : "";
    const result = await fetchPageMarkdown(siteUrl(), source.pathname, query, request.headers);
    return new Response(result.body, { status: result.status, headers });
  } catch {
    return new Response("# Page temporarily unavailable\n", { status: 503, headers });
  }
}
