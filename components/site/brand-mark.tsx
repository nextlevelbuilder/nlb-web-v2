/** Four-point star inside an orbit: the NLB mark from the Constellation design. */
export default function BrandMark({ orbit = true }: { orbit?: boolean }) {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5l1.9 11.6L29.5 16l-11.6 1.9L16 29.5l-1.9-11.6L2.5 16l11.6-1.9z" fill="currentColor" />
      {orbit && <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeWidth=".75" opacity=".45" />}
    </svg>
  );
}
