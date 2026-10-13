import React from "react";
import type { ChangelogBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitCommit } from "lucide-react";

export function ChangelogBlockView({ block }: { block: ChangelogBlock }) {
  const { entries } = block.props;

  return (
    <div className="w-full my-6 space-y-6">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <GitCommit className="w-5 h-5 text-primary" />
        <h3 className="font-display text-step-xl text-foreground">Changelog & Updates</h3>
      </div>
      <div className="space-y-4">
        {entries.map((entry, index) => (
          <Card key={index} className="p-6 bg-surface border-line space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-medium text-foreground">{entry.version}</span>
              <Badge variant="outline" className="text-xs text-ink-2">
                {entry.date}
              </Badge>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-ink-2">
              {entry.changes.map((change, cIndex) => (
                <li key={cIndex}>{change}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
