import React from "react";
import type { Block } from "@/packages/contracts/src";
import { Quote } from "lucide-react";

export function QuoteBlockView({ block }: { block: Extract<Block, { type: "quote" }> }) {
  const { quote, author, title, avatarUrl } = block.props;

  return (
    <div className="flex flex-col items-center text-center p-10 rounded-2xl bg-white/[0.02] border border-white/10 my-4">
      <Quote className="w-10 h-10 text-primary/40 mb-6" />
      <blockquote className="text-xl md:text-2xl font-medium italic text-foreground max-w-3xl mb-6">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <div className="flex items-center gap-3">
        {avatarUrl && (
          <img src={avatarUrl} alt={author} className="w-10 h-10 rounded-full object-cover border border-white/20" />
        )}
        <div className="text-left">
          <div className="font-bold text-sm text-foreground">{author}</div>
          {title && <div className="text-xs text-muted-foreground">{title}</div>}
        </div>
      </div>
    </div>
  );
}
