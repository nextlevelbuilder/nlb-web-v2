import { openApiSpec } from "@/lib/openapi";
import { defaultOgImage, serializeJsonLd, siteUrl } from "@/lib/seo";
import { BUILDER_LEAGUE_AVAILABILITY } from "@/lib/discovery/builder-league-discovery";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function renderApiReference() {
  const operations = Object.entries(openApiSpec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).filter(([method]) => ["get", "post", "delete", "patch", "put"].includes(method)).map(([method, operation]) => {
      const details = operation as { summary: string; description?: string };
      return `<li><h3><code>${method.toUpperCase()} ${escapeHtml(path)}</code></h3><p>${escapeHtml(details.summary)}</p><p>${escapeHtml(details.description || "")}</p></li>`;
    })
  ).join("\n");
  const configuration = JSON.stringify({
    url: "/api/openapi.json", theme: "purple", layout: "modern", darkMode: true,
    persistAuth: false, withDefaultFonts: false, telemetry: false,
    showDeveloperTools: "never", agent: { disabled: true },
  }).replace(/</g, "\\u003c");

  const base = siteUrl();
  const og = defaultOgImage();
  const title = "API Reference | Next Level Builders";
  const description = "Explore and try the Next Level Builders REST API: product documents, Activities, Pulse, revisions, submissions and agent integrations.";
  const jsonLd = serializeJsonLd({
    "@context": "https://schema.org", "@type": "TechArticle", headline: "Next Level Builders API", description,
    url: `${base}/api-docs`, inLanguage: "en", publisher: { "@type": "Organization", name: "Next Level Builders", url: base },
  });
  const social = [
    ["og:title", title], ["og:description", description], ["og:url", `${base}/api-docs`], ["og:type", "website"],
    ["og:site_name", "Next Level Builders"], ["og:image", og.url], ["og:image:width", String(og.width)], ["og:image:height", String(og.height)], ["og:image:alt", og.alt],
  ].map(([property, content]) => `<meta property="${property}" content="${escapeHtml(content)}">`).join("")
    + `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(og.url)}">`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>API Reference | Next Level Builders</title>
<meta name="description" content="Explore and try the Next Level Builders REST API: product documents, Activities, Pulse, revisions, submissions and agent integrations.">
<link rel="canonical" href="${escapeHtml(base)}/api-docs">${social}<script type="application/ld+json">${jsonLd}</script>
<link rel="alternate" type="text/markdown" href="/api-docs.md">
<link rel="icon" href="/favicon.ico">
<style>body{margin:0;background:#0d1117;color:#e6edf3;font:16px/1.65 system-ui,sans-serif}#docs-intro a,#endpoint-index a{color:#a5b4fc}#docs-intro,#endpoint-index{max-width:1100px;margin:auto;padding:24px}#docs-intro h1{line-height:1.2}#docs-intro code,#endpoint-index code{overflow-wrap:anywhere}#endpoint-index summary{cursor:pointer}#endpoint-index li{margin-bottom:24px}#docs-intro nav{display:flex;gap:20px;flex-wrap:wrap}#scalar-reference{min-height:70vh}</style>
</head><body>
<header id="docs-intro"><nav aria-label="Developer navigation"><a href="/build-with-us">Build with Us</a><a href="/build-with-us/instructions">Integration guide</a><a href="/studio">Builder Studio</a><a href="/api/openapi.json">OpenAPI JSON</a><a href="/api-docs.md">Markdown</a></nav>
<h1>Next Level Builders API</h1>
<p>Explore request schemas, generate code snippets and send real requests with the interactive reference below.</p>
<p>Create an API key in <a href="/profile">your profile</a>. Builder endpoints accept <code>Authorization: Bearer nlb_live_…</code> or <code>x-api-key: nlb_live_…</code>. Organization membership is required. Voting and key management require a signed-in browser session.</p>
<p>Builder League (<code>/api/v1/builder-*</code>): members and their agents can read their own data and submit their own evidence and projects with a session, an API key or MCP delegation (<code>mcp:read</code> / <code>mcp:write</code>). Agents cannot approve, verify or award, and cannot read another member's private history. Admin routes need a signed-in admin session, except the render worker and Discord ingest, which take an admin API key minted with the <code>builder:render</code> or <code>builder:ingest</code> scope. ${escapeHtml(BUILDER_LEAGUE_AVAILABILITY)}</p>
<p>Use the current website origin for session requests. Requests sent with “Test Request” run against the server you select and can save drafts or submit for review. Credentials are not persisted by this reference.</p>
<p>HTTP MCP: <a href="https://nextlevelbuilder.io/mcp">https://nextlevelbuilder.io/mcp</a>. To design a draft in your browser, enable WebMCP in Studio and connect your client.</p>
</header>
<main id="endpoint-index"><details><summary>Readable endpoint index</summary><ul>${operations}</ul></details>
<noscript><p>Enable JavaScript for the interactive request console. The endpoint index and OpenAPI document remain available without JavaScript.</p></noscript></main>
<div id="scalar-reference"></div>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.68.0/dist/browser/standalone.js"></script>
<script>if(window.Scalar){Scalar.createApiReference('#scalar-reference',${configuration});}else{document.getElementById('scalar-reference').textContent='Interactive reference could not load. Use the endpoint index or download OpenAPI JSON above.';}</script>
</body></html>`;
}

