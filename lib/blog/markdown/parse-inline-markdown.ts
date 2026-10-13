/**
 * Inline Markdown → InlineNode[] (code spans, **strong**, *em*, ~~del~~, [links](href "title"),
 * ![images](src), <https://autolinks>, backslash escapes and hard breaks). HTML is never interpreted:
 * it remains text and React escapes it on render. Links and images whose URL fails the shared
 * allowlists degrade to their plain text. Nesting depth is capped so hostile input stays linear-ish.
 */
import { isSafeHref, isSafeImageSrc } from "../blocks/block-fields";
import type { InlineNode } from "./markdown-types";

const MAX_DEPTH = 6;
/** Longest span searched for a closing delimiter or bracket; bounds work on unclosed markers. */
const MAX_SPAN = 2000;
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~<>|]/;
const WORD_CHAR = /[\p{L}\p{N}]/u;

interface LinkMatch {
  label: string;
  href: string;
  title?: string;
  end: number;
}

function matchCodeSpan(src: string, start: number): { value: string; end: number } | null {
  let run = 0;
  while (src[start + run] === "`") run++;
  const fence = "`".repeat(run);
  let from = start + run;
  const limit = Math.min(src.length, start + MAX_SPAN);
  while (from < limit) {
    const close = src.indexOf(fence, from);
    if (close === -1 || close > limit) return null;
    if (src[close + run] !== "`") {
      let value = src.slice(start + run, close).replace(/\n/g, " ");
      if (value.length > 2 && value.startsWith(" ") && value.endsWith(" ") && value.trim()) value = value.slice(1, -1);
      return { value, end: close + run };
    }
    from = close + run;
    while (src[from] === "`") from++;
  }
  return null;
}

/** Parses `[label](destination "title")` starting at the "[" index. */
function matchLink(src: string, open: number): LinkMatch | null {
  let depth = 0;
  let close = -1;
  const limit = Math.min(src.length, open + MAX_SPAN);
  for (let i = open; i < limit; i++) {
    const ch = src[i];
    if (ch === "\\") i++;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close === -1 || src[close + 1] !== "(") return null;
  let i = close + 2;
  while (src[i] === " ") i++;
  let href = "";
  if (src[i] === "<") {
    const end = src.indexOf(">", i);
    if (end === -1) return null;
    href = src.slice(i + 1, end);
    i = end + 1;
  } else {
    let parens = 0;
    while (i < src.length && !/\s/.test(src[i])) {
      if (src[i] === "(") parens++;
      else if (src[i] === ")" && parens-- === 0) break;
      href += src[i++];
    }
  }
  while (src[i] === " ") i++;
  let title: string | undefined;
  const quote = src[i];
  if (quote === '"' || quote === "'") {
    const end = src.indexOf(quote, i + 1);
    if (end === -1) return null;
    title = src.slice(i + 1, end);
    i = end + 1;
    while (src[i] === " ") i++;
  }
  if (src[i] !== ")") return null;
  return { label: src.slice(open + 1, close), href: href.trim(), title, end: i + 1 };
}

/**
 * Every position in `src` that can close a delimiter run: preceded by non-whitespace and not escaped;
 * single `*`/`_` must not touch another of the same char; `_` must not be followed by a word char
 * (so snake_case stays literal). Computed once per parse so lookups are a binary search, keeping
 * unclosed openers from rescanning the rest of the text.
 */
function closerPositions(src: string, delim: string): number[] {
  const size = delim.length;
  const out: number[] = [];
  for (let j = src.indexOf(delim, 1); j !== -1; j = src.indexOf(delim, j + 1)) {
    const before = src[j - 1];
    if (/\s/.test(before) || before === "\\") continue;
    if (size === 1 && (src[j + 1] === delim || before === delim)) continue;
    if (delim[0] === "_" && WORD_CHAR.test(src[j + size] ?? "")) continue;
    out.push(j);
  }
  return out;
}

/** Finds the closer for a delimiter run (`**`, `__`, `~~`, `*`, `_`) opened at `start`. */
function findCloser(src: string, start: number, delim: string, candidates: number[]): number {
  const size = delim.length;
  if (/\s/.test(src[start + size] ?? " ")) return -1;
  if (delim[0] === "_" && WORD_CHAR.test(src[start - 1] ?? "")) return -1;
  const min = start + size + 1;
  let lo = 0;
  let hi = candidates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candidates[mid] < min) lo = mid + 1;
    else hi = mid;
  }
  const close = candidates[lo];
  return close !== undefined && close < start + MAX_SPAN ? close : -1;
}

const EMPHASIS: { delim: string; kind: "strong" | "em" | "del" }[] = [
  { delim: "**", kind: "strong" },
  { delim: "__", kind: "strong" },
  { delim: "~~", kind: "del" },
  { delim: "*", kind: "em" },
  { delim: "_", kind: "em" },
];

export function parseInlineMarkdown(src: string, depth = 0): InlineNode[] {
  const out: InlineNode[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ kind: "text", value: buffer });
    buffer = "";
  };
  const push = (node: InlineNode) => {
    flush();
    out.push(node);
  };
  const closers = new Map<string, number[]>();
  const closersFor = (delim: string) => {
    let list = closers.get(delim);
    if (!list) closers.set(delim, (list = closerPositions(src, delim)));
    return list;
  };
  const nested = (text: string) => (depth < MAX_DEPTH ? parseInlineMarkdown(text, depth + 1) : [{ kind: "text" as const, value: text }]);

  let i = 0;
  outer: while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      const next = src[i + 1];
      if (next === "\n") push({ kind: "br" });
      else if (next !== undefined && ESCAPABLE.test(next)) buffer += next;
      else buffer += ch + (next ?? "");
      i += 2;
      continue;
    }
    if (ch === "\n") {
      if (/ {2,}$/.test(buffer)) {
        buffer = buffer.replace(/ +$/, "");
        push({ kind: "br" });
      } else buffer += "\n";
      i++;
      continue;
    }
    if (ch === "`") {
      const code = matchCodeSpan(src, i);
      if (code) {
        push({ kind: "code", value: code.value });
        i = code.end;
        continue;
      }
      while (src[i] === "`") buffer += src[i++];
      continue;
    }
    if (ch === "!" && src[i + 1] === "[") {
      const link = matchLink(src, i + 1);
      if (link) {
        if (link.href && isSafeImageSrc(link.href)) push({ kind: "image", src: link.href, alt: link.label, ...(link.title ? { title: link.title } : {}) });
        else buffer += link.label;
        i = link.end;
        continue;
      }
    }
    if (ch === "[") {
      const link = matchLink(src, i);
      if (link) {
        const children = nested(link.label);
        if (link.href && isSafeHref(link.href)) push({ kind: "link", href: link.href, ...(link.title ? { title: link.title } : {}), children });
        else {
          flush();
          out.push(...children);
        }
        i = link.end;
        continue;
      }
    }
    if (ch === "<") {
      const auto = /^<(https?:\/\/[^\s<>]+)>/.exec(src.slice(i, i + 510));
      if (auto && isSafeHref(auto[1])) {
        push({ kind: "link", href: auto[1], children: [{ kind: "text", value: auto[1] }] });
        i += auto[0].length;
        continue;
      }
    }
    if (ch === "*" || ch === "_" || ch === "~") {
      for (const { delim, kind } of EMPHASIS) {
        if (!src.startsWith(delim, i)) continue;
        const close = findCloser(src, i, delim, closersFor(delim));
        if (close === -1) continue;
        push({ kind, children: nested(src.slice(i + delim.length, close)) });
        i = close + delim.length;
        continue outer;
      }
    }
    buffer += ch;
    i++;
  }
  flush();
  return out;
}

/** Plain text of an inline tree (used for heading ids, alt text and reading time). */
export function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text" || node.kind === "code") return node.value;
      if (node.kind === "image") return node.alt;
      if (node.kind === "br") return " ";
      return inlineText(node.children);
    })
    .join("");
}
