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
      className={`flex items-start gap-3 rounded-sm border border-line bg-surface p-4 text-step-sm leading-relaxed text-ink-2 ${className}`}
    >
      <div aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-line text-primary">
        <Info className="w-3 h-3" />
      </div>
      <div>
        <strong className="text-foreground font-semibold">Editorial Independence:</strong>{" "}
        Products may be independently selected for editorial or homepage features based on quality, relevance, and community interest. Payment does not affect selection or ranking. Internal Next Level Builder portfolio projects are curated under identical quality standards.
      </div>
    </div>
  );
}
