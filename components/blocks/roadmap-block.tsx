import React from "react";
import type { RoadmapBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Compass, CheckCircle, Clock, Circle } from "lucide-react";

export function RoadmapBlockView({ block }: { block: RoadmapBlock }) {
  const { milestones } = block.props;

  return (
    <div className="w-full my-6 space-y-6">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Compass className="w-5 h-5 text-primary" />
        <h3 className="text-xl font-bold text-foreground">Product Roadmap</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {milestones.map((m, index) => {
          const isDone = m.status === "completed";
          const isInProgress = m.status === "in_progress";

          return (
            <Card
              key={index}
              className={`p-6 rounded-2xl border ${
                isInProgress
                  ? "border-primary/40 bg-primary/[0.03]"
                  : isDone
                  ? "border-white/20 bg-white/[0.03]"
                  : "border-white/10 bg-white/[0.01]"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono font-bold text-muted-foreground uppercase">{m.quarter}</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    isDone
                      ? "border-green-500/40 text-green-400 bg-green-500/10"
                      : isInProgress
                      ? "border-primary/40 text-primary bg-primary/10"
                      : "text-muted-foreground"
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
              <h4 className="font-bold text-foreground">{m.title}</h4>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
