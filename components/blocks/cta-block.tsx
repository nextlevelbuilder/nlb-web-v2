import React from "react";
import type { CtaBlock } from "@/packages/contracts/src";
import { ArrowUpRight } from "lucide-react";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";
import { OrbitMotif } from "./orbit-motif";

/** Finale plate: centred display heading under a lit star, one primary action. */
export function CtaBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: CtaBlock; labels?: BlockLabels }) {
  const { title, subtitle, buttonText, buttonUrl } = block.props;

  return (
    <section className="blk blk-cta surface">
      <OrbitMotif className="blk-orbit blk-cta-orbit" />
      <div className="blk-cta-body">
        <h2 className="blk-cta-title">{title}</h2>
        {subtitle && <p className="blk-cta-sub">{subtitle}</p>}
        <a className="btn btn-primary" href={buttonUrl} target="_blank" rel="noopener noreferrer">
          {buttonText}
          <ArrowUpRight aria-hidden className="arrow" />
          <span className="sr-only">{labels.opensInNewTab}</span>
        </a>
      </div>
    </section>
  );
}
