import { htmlToMarkdown } from "./html-to-markdown";
import { pagePath } from "./page-paths";
import { pageFetcher } from "./page-fetch";

const MAX_HTML_BYTES = 8 * 1024 * 1024;

async function readHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) throw new Error("Page is too large to convert");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}

export async function fetchPageMarkdown(origin: string, pathname: string, query: string, incomingHeaders: Headers, fetcher?: typeof fetch): Promise<{ body: string; status: number }> {
  const initial = pagePath(pathname);
  if (!initial) return { body: "# Not found\n", status: 404 };
  const render = fetcher || pageFetcher();
  // Legacy documentation aliases resolve to the same public reference page.
  const sourcePath = ["/api/docs", "/docs/api", "/api-docs"].includes(initial.path) ? "/api-docs" : initial.pathname;
  let target = new URL(sourcePath, origin);
  target.search = query;
  const headers = new Headers({ Accept: "text/html", "User-Agent": "NLB-MarkdownBot", "x-nlb-markdown": "1" });
  for (const name of ["cookie", "authorization", "accept-language"]) {
    const value = incomingHeaders.get(name);
    if (value) headers.set(name, value);
  }
  // Pin locale so an unprefixed URL cannot change language with a visitor cookie.
  headers.set("accept-language", initial.locale);
  headers.set("cookie", `${headers.get("cookie")?.replace(/(?:^|;\s*)NEXT_LOCALE=[^;]*/g, "") || ""}; NEXT_LOCALE=${initial.locale}`);
  // A service-binding request carries no Host. Without it OpenNext classifies next-intl's absolute
  // locale rewrite as external and proxies it over the public internet to whatever DNS serves.
  headers.set("host", new URL(origin).host);
  for (let hop = 0; hop < 5; hop++) {
    if (target.origin !== new URL(origin).origin || !pagePath(target.pathname)) return { body: "# Not found\n", status: 404 };
    const response = await render(target, { headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return { body: "# Page unavailable\n", status: 502 };
      target = new URL(location, target);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      const status = [401, 403, 404].includes(response.status) ? response.status : 502;
      return { body: status === 404 ? "# Not found\n" : "# Page unavailable\n", status };
    }
    if (!response.headers.get("content-type")?.includes("text/html")) {
      await response.body?.cancel();
      return { body: "# Page unavailable\n", status: 502 };
    }
    const html = await readHtml(response);
    // Next can stream a notFound after headers were sent; preserve its 404.
    if (/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND|<title>404:/i.test(html)) return { body: "# Not found\n", status: 404 };
    const body = await htmlToMarkdown(html, target.href);
    return { body: `Source: <${target.href}>\n\n${body}`, status: 200 };
  }
  return { body: "# Page unavailable\n", status: 502 };
}
