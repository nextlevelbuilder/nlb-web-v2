import React from "react";
import type { TechStackBlock } from "@/packages/contracts/src";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

export function TechStackBlockView({ block }: { block: TechStackBlock }) {
  const { technologies } = block.props;

  return (
    <div className="w-full my-6 p-8 rounded-sm border border-line bg-surface space-y-6">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Layers className="w-5 h-5 text-primary" />
        <h3 className="font-display text-step-xl text-foreground">Technology Stack</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {technologies.map((tech, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-4 py-2 rounded-sm bg-surface-raised border border-line hover:border-primary/40 transition-colors"
          >
            <span className="font-semibold text-sm text-foreground">{tech.name}</span>
            <Badge variant="outline" className="text-step-xs text-ink-2 bg-canvas-deep border-line px-1.5 py-0.5">
              {tech.category}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
