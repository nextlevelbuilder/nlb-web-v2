import React from "react";
import type { PricingBlock } from "@nextlevelbuilder/contracts";
import { ArrowUpRight } from "lucide-react";
import { BlockSection } from "./block-section";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";

/** Pricing plates: tier name as a kicker, the price in display type, diamond feature list, CTA. */
export function PricingBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: PricingBlock; labels?: BlockLabels }) {
  const { tiers } = block.props;

  return (
    <BlockSection blockId={block.id} kicker={labels.pricing} className="blk-pricing">
      <ul className="blk-pricing-list" data-count={tiers.length}>
        {tiers.map((tier, index) => (
          <li key={index} className={`blk-tier surface${tier.isPopular ? " is-popular" : ""}`}>
            <div className="blk-tier-head">
              <h3 className="blk-tier-name mono">{tier.name}</h3>
              {tier.isPopular && <span className="badge">{labels.popular}</span>}
            </div>
            <p className="blk-tier-price">
              <span className="num-tab">{tier.price}</span>
              {tier.period && <span className="blk-tier-period">/{tier.period}</span>}
            </p>
            {tier.features.length > 0 && (
              <ul className="feats blk-tier-feats">
                {tier.features.map((feature, fIndex) => <li key={fIndex}>{feature}</li>)}
              </ul>
            )}
            {tier.ctaUrl ? (
              <a
                className={`btn btn-sm ${tier.isPopular ? "btn-primary" : "btn-ghost"} blk-tier-cta`}
                href={tier.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {tier.ctaText}
                <ArrowUpRight aria-hidden className="arrow" />
                <span className="sr-only">{labels.opensInNewTab}</span>
              </a>
            ) : (
              // Without a destination the CTA text is a note, not a control that does nothing.
              tier.ctaText && <p className="blk-tier-note mono">{tier.ctaText}</p>
            )}
          </li>
        ))}
      </ul>
    </BlockSection>
  );
}
