/** Section header in the chapter-plate language: mono label with a hairline, then the h2. */
export function SectionHead({ id, label, title }: { id: string; label: string; title: string }) {
  return (
    <div className="live-section-head">
      <p className="mono live-section-label"><span>{label}</span><span className="rule" aria-hidden="true" /></p>
      <h2 id={id} className="live-section-title">{title}</h2>
    </div>
  );
}
