import React from "react";
import type { MilestonesBlock } from "@/packages/contracts/src";
import { Flag } from "lucide-react";

export function MilestonesBlockView({ block }: { block: MilestonesBlock }) {
  const { items } = block.props;

  return (
    <div className="w-full my-6 p-8 rounded-2xl border border-white/10 bg-white/[0.02] space-y-6">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Flag className="w-5 h-5 text-primary" />
        <h3 className="text-xl font-bold text-foreground">Key Milestones</h3>
      </div>

      <div className="relative border-l border-white/10 ml-4 space-y-8 pl-6">
        {items.map((item, index) => (
          <div key={index} className="relative group">
            <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
            <div className="text-xs font-mono font-bold text-primary mb-1">{item.date}</div>
            <h4 className="text-base font-bold text-foreground">{item.title}</h4>
            {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
