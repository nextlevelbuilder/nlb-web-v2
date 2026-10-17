/** Reading-time estimate from a post's blocks (~220 words per minute, never below one minute). */
import type { BlogBlock } from "./blocks/block-types";

const SKIPPED_KEYS = new Set(["src", "logo", "href", "url", "sourceUrl", "language", "variant", "tone", "width", "align", "style", "aspect", "anchor"]);

function collectText(value: unknown, out: string[], key?: string): void {
  if (key && SKIPPED_KEYS.has(key)) return;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectText(item, out));
  else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => collectText(v, out, k));
}

export function readingMinutes(blocks: BlogBlock[]): number {
  const parts: string[] = [];
  blocks.forEach((block) => collectText(block.props, parts));
  const words = parts.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
