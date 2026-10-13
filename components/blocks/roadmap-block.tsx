import React from "react";
import type { RoadmapBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Compass, CheckCircle, Clock, Circle } from "lucide-react";

export function RoadmapBlockView({ block }: { block: RoadmapBlock }) {
  const { milestones } = block.props;

  return (
    <div className="w-full my-6 space-y-6">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Compass className="w-5 h-5 text-primary" />
        <h3 className="font-display text-step-xl text-foreground">Product Roadmap</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {milestones.map((m, index) => {
          const isDone = m.status === "completed";
          const isInProgress = m.status === "in_progress";

          return (
            <Card
              key={index}
              className={`p-6 rounded-sm border ${
                isInProgress
                  ? "border-primary/40 bg-primary/[0.03]"
                  : isDone
                  ? "border-line-strong bg-surface-raised"
                  : "border-line bg-surface"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono font-medium text-ink-2 uppercase">{m.quarter}</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    isDone
                      ? "border-success/40 text-success bg-success/10"
                      : isInProgress
                      ? "border-primary/40 text-primary bg-primary/10"
                      : "text-ink-2"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle className="w-3 h-3 mr-1 inline" />
                  ) : isInProgress ? (
                    <Clock className="w-3 h-3 mr-1 inline" />
                  ) : (
                    <Circle className="w-3 h-3 mr-1 inline" />
                  )}
                  {m.status.replace("_", " ")}
                </Badge>
              </div>
              <h4 className="font-medium text-foreground">{m.title}</h4>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
