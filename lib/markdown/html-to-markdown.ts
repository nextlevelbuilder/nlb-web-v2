import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

type HtmlNode = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: HtmlNode[] };

function cleanHtml(baseUrl: string) {
  return () => (tree: HtmlNode) => {
    const visit = (node: HtmlNode) => {
      if (!node.children) return;
      node.children = node.children.filter((child) => child.type !== "comment" && !["script", "style", "svg", "head", "noscript"].includes(child.tagName || ""));
      for (const child of node.children) {
        if (child.properties) {
          for (const key of ["href", "src"]) {
            const value = child.properties[key];
            if (typeof value === "string") {
              try {
                const url = new URL(value, baseUrl);
                child.properties[key] = ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : "";
              } catch { child.properties[key] = ""; }
            }
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

/** Parse HTML structurally, discard executable/RSC payloads, retain semantic page content (GFM tables included). */
export async function htmlToMarkdown(html: string, baseUrl: string) {
  const result = await unified().use(rehypeParse).use(cleanHtml(baseUrl)).use(rehypeRemark).use(remarkGfm).use(remarkStringify, { bullet: "-" }).process(html);
  return String(result).trim() + "\n";
}
