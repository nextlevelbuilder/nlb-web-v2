import React from "react";
import type { GridBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";

export function GridBlockView({ block }: { block: GridBlock }) {
  const { columns, items } = block.props;

  const gridColsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
      ? "grid-cols-1 md:grid-cols-2"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid ${gridColsClass} gap-6 w-full`}>
      {items.map((item, index) => (
        <Card key={index} className="p-6 bg-white/[0.03] border-white/10 hover:border-primary/40 transition-colors">
          <h3 className="text-xl font-bold text-foreground mb-2">{item.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
        </Card>
      ))}
    </div>
  );
}
