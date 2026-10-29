import type { ProductDocument } from "@nextlevelbuilder/contracts";

export function markdownText(value: string) {
  return value.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
}

function fields(value: unknown, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" && item !== null ? `${indent}-\n${fields(item, depth + 1)}` : `${indent}- ${markdownText(String(item))}\n`).join("");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => {
    const label = markdownText(key.replace(/([a-z])([A-Z])/g, "$1 $2"));
    return item && typeof item === "object" ? `${indent}- **${label}:**\n${fields(item, depth + 1)}` : `${indent}- **${label}:** ${markdownText(String(item ?? ""))}\n`;
  }).join("");
  return `${indent}${markdownText(String(value ?? ""))}\n`;
}

/** Include every field of every published block, including hidden accordion/carousel items. */
export function productMarkdown(document: ProductDocument, canonicalUrl: string) {
  const sections = [
    `# ${markdownText(document.title)}`,
    markdownText(document.tagline),
    `Source: <${canonicalUrl}>`,
    `Website: <${document.websiteUrl}>`,
    ...(document.logoUrl ? [`Logo: <${document.logoUrl}>`] : []),
    markdownText(document.description),
    `Categories: ${document.categorySlugs.map(markdownText).join(", ")}`,
    `Tags: ${(document.tagSlugs || []).map(markdownText).join(", ")}`,
  ];
  for (const block of document.blocks) {
    const props = { ...block.props } as Record<string, unknown>;
    if (block.type === "activities" && Array.isArray(props.entries)) {
      props.entries = [...props.entries].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }
    sections.push(`## ${markdownText(block.type.replace(/([a-z])([A-Z])/g, "$1 $2"))}\n\n${fields(props)}`);
    if (block.type === "analytics") {
      const canonical = new URL(canonicalUrl);
      const slug = canonical.pathname.split("/").filter(Boolean).at(-1)!;
      sections.push(`Traffic totals (${block.props.period}) for this NLB product page: <${canonical.origin}/api/v1/products/${encodeURIComponent(slug)}/traffic/public?period=${block.props.period}>`);
    }
    if (block.type === "pulse") {
      const canonical = new URL(canonicalUrl);
      const slug = canonical.pathname.split("/").filter(Boolean).at(-1)!;
      sections.push(`Saved health history: <${canonical.origin}/api/v1/products/${encodeURIComponent(slug)}/pulse>\n\nPulse samples the published website on visits, at most every five minutes. This Markdown export does not trigger a health check.`);
    }
  }
  return sections.join("\n\n") + "\n";
}
