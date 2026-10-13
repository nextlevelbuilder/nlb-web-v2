import React from "react";
import type { TechStackBlock } from "@/packages/contracts/src";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

export function TechStackBlockView({ block }: { block: TechStackBlock }) {
  const { technologies } = block.props;

  return (
    <div className="w-full my-6 p-8 rounded-2xl border border-white/10 bg-white/[0.02] space-y-6">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Layers className="w-5 h-5 text-primary" />
        <h3 className="text-xl font-bold text-foreground">Technology Stack</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {technologies.map((tech, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:border-primary/40 transition-colors"
          >
            <span className="font-semibold text-sm text-foreground">{tech.name}</span>
            <Badge variant="outline" className="text-[10px] text-muted-foreground bg-black/40 border-white/10 px-1.5 py-0.5">
              {tech.category}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
