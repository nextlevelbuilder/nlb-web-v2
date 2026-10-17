import React from "react";
import type { LiveDemoBlock } from "@/packages/contracts/src";

export function LiveDemoBlockView({ block }: { block: LiveDemoBlock }) {
  const { embedUrl, sandboxTokens, height } = block.props;

  // Enforce secure restricted iframe sandbox by default
  const effectiveSandbox = sandboxTokens || "allow-scripts allow-popups allow-forms";

  return (
    <div className="w-full my-6 rounded-sm overflow-hidden border border-line bg-canvas-deep">
      <div className="flex items-center gap-2 px-4 py-3 bg-surface-raised border-b border-line text-xs text-ink-2">
        <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-destructive/80" />
        <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-warning/80" />
        <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-success/80" />
        <span className="ml-2 font-mono truncate">{embedUrl}</span>
      </div>
      <iframe
        src={embedUrl}
        sandbox={effectiveSandbox}
        style={{ height: `${height}px` }}
        className="w-full border-0"
        title="Live Demo Preview"
        loading="lazy"
      />
    </div>
  );
}
