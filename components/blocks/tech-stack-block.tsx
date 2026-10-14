import React from "react";
import type { TechStackBlock } from "@/packages/contracts/src";
import { BlockSection } from "./block-section";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";

/** Group technologies by their declared category, keeping first-seen order. */
export function groupTechnologies(technologies: TechStackBlock["props"]["technologies"]): Array<{ category: string; names: string[] }> {
  const groups = new Map<string, string[]>();
  for (const tech of technologies) {
    const category = tech.category.trim() || "—";
    const names = groups.get(category) ?? [];
    names.push(tech.name);
    groups.set(category, names);
  }
  return [...groups].map(([category, names]) => ({ category, names }));
}

/** Instrument list: one row per category (mono label) with the technologies as hairline pills. */
export function TechStackBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: TechStackBlock; labels?: BlockLabels }) {
  const groups = groupTechnologies(block.props.technologies);

  return (
    <BlockSection blockId={block.id} kicker={labels.techStack} className="blk-stack">
      <dl className="blk-stack-list surface">
        {groups.map((group) => (
          <div key={group.category} className="blk-stack-row">
            <dt className="mono">{group.category}</dt>
            <dd>
              <ul className="blk-pills">
                {group.names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </BlockSection>
  );
}
