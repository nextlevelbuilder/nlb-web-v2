/** Chapter header: roman numeral, chapter name and a hairline rule. Decorative context above each h2. */
export default function SectionPlate({ numeral, name }: { numeral: string; name: string }) {
  return (
    <p className="plate">
      <span className="plate-numeral">{numeral}</span>
      <span>{name}</span>
      <span className="plate-rule" aria-hidden="true" />
    </p>
  );
}
