/** Chapter header: roman numeral, chapter name, a hairline rule that draws in, and sky coordinates. */
export default function ChapterPlate({ numeral, name, coord }: { numeral: string; name: string; coord: string }) {
  return (
    <header className="plate mono">
      <span className="rn">{numeral}</span>
      <span>{name}</span>
      <span className="rule" />
      <span className="coord">{coord}</span>
    </header>
  );
}
