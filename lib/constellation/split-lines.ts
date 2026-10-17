/**
 * Group split words into visual lines by their offsetTop, so a heading rises line by line.
 * Re-run after fonts load or the layout changes: line breaks depend on the rendered font.
 */
export function groupWordsIntoLines(words: HTMLElement[], measure: (word: HTMLElement) => number): HTMLElement[][] {
  const lines: HTMLElement[][] = [];
  let lastTop: number | null = null;
  for (const word of words) {
    const top = Math.round(measure(word));
    if (lastTop === null || Math.abs(top - lastTop) > 4) {
      lines.push([]);
      lastTop = top;
    }
    lines[lines.length - 1].push(word);
  }
  return lines;
}

export function lineIndexOf(lines: HTMLElement[][], word: Element): number {
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(word as HTMLElement)) return i;
  return 0;
}

/** Words of a [data-split] element: `.wi` (masked rise) or `.fw` (fade). */
export function splitWordsOf(el: Element): HTMLElement[] {
  const mode = el.getAttribute('data-split');
  return Array.from(el.querySelectorAll<HTMLElement>(mode === 'fade' ? '.fw' : '.wi'));
}

export function linesOf(el: Element): HTMLElement[][] {
  const mode = el.getAttribute('data-split');
  return groupWordsIntoLines(splitWordsOf(el), (w) => (mode === 'fade' ? w : (w.parentElement ?? w)).offsetTop);
}
