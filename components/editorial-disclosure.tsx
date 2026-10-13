import React from "react";
import { Info } from "lucide-react";

interface EditorialDisclosureProps {
  className?: string;
}

export default function EditorialDisclosure({ className = "" }: EditorialDisclosureProps) {
  return (
    <div
      role="note"
      aria-label="Editorial Independence Disclosure"
      className={`p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-muted-foreground flex items-start gap-3 leading-relaxed ${className}`}
    >
      <div className="w-5 h-5 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
        <Info className="w-3 h-3" />
      </div>
      <div>
        <strong className="text-foreground font-semibold">Editorial Independence:</strong>{" "}
        Products may be independently selected for editorial or homepage features based on quality, relevance, and community interest. Payment does not affect selection or ranking. Internal Next Level Builder portfolio projects are curated under identical quality standards.
      </div>
    </div>
  );
}
