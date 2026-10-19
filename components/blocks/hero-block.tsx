import React from "react";
import type { HeroBlock } from "@nextlevelbuilder/contracts";
import { ArrowUpRight } from "lucide-react";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";
import { OrbitMotif } from "./orbit-motif";

/** Epigraph plate: the product's own headline in display type beside an orbit engraving. */
export function HeroBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: HeroBlock; labels?: BlockLabels }) {
  const { headline, subheadline, primaryCtaText, primaryCtaUrl, badge } = block.props;

  return (
    <section className="blk blk-hero surface">
      <OrbitMotif className="blk-orbit blk-hero-orbit" />
      <div className="blk-hero-body">
        {badge && <p className="badge">{badge}</p>}
        {/* The product page owns the h1; block headlines start at h2. */}
        <h2 className="blk-hero-title">{headline}</h2>
        {subheadline && <p className="blk-hero-sub">{subheadline}</p>}
        {primaryCtaText && primaryCtaUrl && (
          <a className="btn btn-primary blk-hero-cta" href={primaryCtaUrl} target="_blank" rel="noopener noreferrer">
            {primaryCtaText}
            <ArrowUpRight aria-hidden className="arrow" />
            <span className="sr-only">{labels.opensInNewTab}</span>
          </a>
        )}
      </div>
    </section>
  );
}
