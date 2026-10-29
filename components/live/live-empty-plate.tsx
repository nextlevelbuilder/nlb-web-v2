/** Empty state in the courses' dashed-orbit plate language (no event scheduled, no vote open). */
export function LiveEmptyPlate({ kicker, title, body, children }: { kicker: string; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="live-empty">
      <svg className="live-empty-orbit" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
        <line className="grid-l" x1="0" y1="60" x2="200" y2="60" />
        <ellipse className="orbit" cx="100" cy="60" rx="86" ry="38" />
        <ellipse className="orbit" cx="100" cy="60" rx="52" ry="22" />
        <circle className="halo" cx="100" cy="60" r="16" />
        <circle className="core" cx="100" cy="60" r="4" />
        <circle className="planet" cx="186" cy="60" r="3" />
      </svg>
      <div className="live-empty-body">
        <p className="mono live-empty-kicker">{kicker}</p>
        <p className="live-empty-title">{title}</p>
        <p className="live-empty-text">{body}</p>
        {children}
      </div>
    </div>
  );
}
