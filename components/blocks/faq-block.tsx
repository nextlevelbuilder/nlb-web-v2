import React from "react";
import type { Block } from "@nextlevelbuilder/contracts";
import { BlockSection } from "./block-section";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";

const GREEK = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "ο", "π", "ρ", "σ", "τ", "υ"] as const;

/** Star-catalogue FAQ: native <details> disclosures, readable and operable without JavaScript. */
export function FaqBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: Extract<Block, { type: "faq" }>; labels?: BlockLabels }) {
  const { items } = block.props;

  return (
    <BlockSection blockId={block.id} kicker={labels.faq} className="blk-faq">
      <div className="blk-faq-list">
        {items.map((item, index) => (
          <details key={index} className="blk-faq-item">
            <summary>
              <span className="blk-faq-greek" aria-hidden="true">{GREEK[index % GREEK.length]}</span>
              <span className="blk-faq-q">{item.question}</span>
              <span className="blk-faq-pm" aria-hidden="true" />
            </summary>
            <p className="blk-faq-a">{item.answer}</p>
          </details>
        ))}
      </div>
    </BlockSection>
  );
}
