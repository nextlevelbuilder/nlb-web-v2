import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { splitRichWords, type SplitWord } from '@/lib/constellation/split-text-parse';

type SplitMode = 'rise' | 'fade';

interface SplitTextProps {
  /** Translated rich string; only <em> is honoured. */
  text: string;
  mode?: SplitMode;
  as?: 'h1' | 'h2' | 'p';
  id?: string;
  className?: string;
  style?: CSSProperties;
}

function word(w: SplitWord, index: number, mode: SplitMode): ReactNode {
  if (mode === 'fade') return <span className="fw">{w.text}</span>;
  return (
    <span className="w">
      <span className="wi" style={{ '--wi': index } as CSSProperties}>{w.text}</span>
    </span>
  );
}

/**
 * Heading pre-split on the server into masked words (`.w > .wi`, line rise) or fade words (`.fw`).
 * The text is fully visible in the server HTML; motion only ever animates transforms/opacity of these
 * spans, so React keeps owning every text node.
 */
export default function SplitText({ text, mode = 'rise', as: Tag = 'h2', id, className, style }: SplitTextProps) {
  const words = splitRichWords(text);
  // Consecutive emphasised words share one <em> so the spaces between them stay italic.
  const runs: { em: boolean; items: { w: SplitWord; i: number }[] }[] = [];
  words.forEach((w, i) => {
    const last = runs[runs.length - 1];
    if (last && last.em === w.em) last.items.push({ w, i });
    else runs.push({ em: w.em, items: [{ w, i }] });
  });

  return (
    <Tag id={id} className={className} style={style} data-split={mode}>
      {runs.map((run, r) => {
        const content = run.items.map(({ w, i }, k) => (
          <Fragment key={i}>{k > 0 ? ' ' : null}{word(w, i, mode)}</Fragment>
        ));
        return <Fragment key={r}>{r > 0 ? ' ' : null}{run.em ? <em>{content}</em> : content}</Fragment>;
      })}
    </Tag>
  );
}
