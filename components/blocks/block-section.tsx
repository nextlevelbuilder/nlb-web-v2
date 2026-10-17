import type { ReactNode } from "react";

/** DOM id derived from a block id; block ids are free text in stored documents. */
export function blockDomId(blockId: string, suffix: string): string {
  return `blk-${blockId.replace(/[^A-Za-z0-9_-]/g, "-")}-${suffix}`;
}

/**
 * Section frame shared by the document blocks: a mono kicker (the section's h2, since the page owns
 * the h1) with a star and a hairline rule, then the block content.
 */
export function BlockSection({ blockId, kicker, className, children }: { blockId: string; kicker: string; className: string; children: ReactNode }) {
  const headingId = blockDomId(blockId, "title");
  return (
    <section className={`blk ${className}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="blk-kicker mono">
        <span className="blk-star" aria-hidden="true">✦</span>
        <span>{kicker}</span>
        <span className="rule" aria-hidden="true" />
      </h2>
      {children}
    </section>
  );
}
