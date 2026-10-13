import React from "react";
import type { LiveDemoBlock } from "@/packages/contracts/src";

export function LiveDemoBlockView({ block }: { block: LiveDemoBlock }) {
  const { embedUrl, sandboxTokens, height } = block.props;

  // Enforce secure restricted iframe sandbox by default
  const effectiveSandbox = sandboxTokens || "allow-scripts allow-popups allow-forms";

  return (
    <div className="w-full my-6 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/40">
      <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.05] border-b border-white/10 text-xs text-muted-foreground">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
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
