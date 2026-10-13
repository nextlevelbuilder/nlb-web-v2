import React from "react";
import type { CaseStudyBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

export function CaseStudyBlockView({ block }: { block: CaseStudyBlock }) {
  const { customerName, problem, solution, outcome, metrics } = block.props;

  return (
    <Card className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] my-6 space-y-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-bold text-foreground">Case Study: {customerName}</h3>
        </div>
        <Badge variant="outline" className="text-xs text-primary border-primary/40 bg-primary/10">
          Customer Success
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <span className="text-xs uppercase font-mono text-muted-foreground font-semibold">The Problem</span>
          <p className="text-sm text-foreground/90 leading-relaxed">{problem}</p>
        </div>
        <div className="space-y-2">
          <span className="text-xs uppercase font-mono text-muted-foreground font-semibold">The Solution</span>
          <p className="text-sm text-foreground/90 leading-relaxed">{solution}</p>
        </div>
        <div className="space-y-2">
          <span className="text-xs uppercase font-mono text-primary font-semibold">The Outcome</span>
          <p className="text-sm text-foreground font-medium leading-relaxed">{outcome}</p>
        </div>
      </div>

      {metrics && metrics.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
          {metrics.map((metric, index) => (
            <Badge key={index} className="bg-primary/20 text-primary border-primary/30 text-xs px-3 py-1">
              {metric}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
