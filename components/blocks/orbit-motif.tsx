/** Decorative orbit-and-star engraving (concentric orbits, a lit core, two planets); hidden from assistive tech. */
export function OrbitMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <line className="grid-l" x1="0" y1="160" x2="320" y2="160" />
      <line className="grid-l" x1="160" y1="0" x2="160" y2="320" />
      <circle className="orbit" cx="160" cy="160" r="150" />
      <circle className="orbit dash" cx="160" cy="160" r="104" />
      <circle className="orbit" cx="160" cy="160" r="58" />
      <circle className="planet" cx="266" cy="54" r="3.5" />
      <circle className="planet" cx="84" cy="230" r="2.5" />
      <circle className="halo" cx="160" cy="160" r="20" />
      <circle className="core" cx="160" cy="160" r="4.5" />
      <path className="spk" d="M160 136v-10M160 184v10M136 160h-10M184 160h10" />
    </svg>
  );
}
