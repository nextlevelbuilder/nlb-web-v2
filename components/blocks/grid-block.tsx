import React from "react";
import type { GridBlock } from "@/packages/contracts/src";
import { BlockSection } from "./block-section";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";

/** Numbered feature plates in one, two or three columns. */
export function GridBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: GridBlock; labels?: BlockLabels }) {
  const { columns, items } = block.props;

  return (
    <BlockSection blockId={block.id} kicker={labels.features} className="blk-grid">
      <ol className="blk-grid-list" data-columns={columns ?? 3}>
        {items.map((item, index) => (
          <li key={index} className="blk-grid-item surface">
            <span className="blk-grid-index mono num-tab" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="blk-grid-title">{item.title}</h3>
            <p className="blk-grid-desc">{item.description}</p>
          </li>
        ))}
      </ol>
    </BlockSection>
  );
}
