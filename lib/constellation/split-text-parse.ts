/**
 * Split a translated rich string ("Find your <em>constellation.</em>") into words for the masked
 * line-rise reveal. Only <em> is recognised; any other markup is treated as text. Non-breaking spaces
 * ( ) stay inside a word so "chòm sao" never breaks across lines.
 */
export interface SplitWord {
  text: string;
  em: boolean;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function decode(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

export function splitRichWords(source: string): SplitWord[] {
  const words: SplitWord[] = [];
  const parts = source.split(/(<em>|<\/em>)/);
  let em = false;
  for (const part of parts) {
    if (part === '<em>') { em = true; continue; }
    if (part === '</em>') { em = false; continue; }
    for (const token of decode(part).split(/[ \t\n\r]+/)) {
      if (token) words.push({ text: token, em });
    }
  }
  return words;
}
