import React from "react";
import type { ActivitiesBlock } from "@nextlevelbuilder/contracts";
import { Card } from "@/components/ui/card";
import { Activity } from "lucide-react";

export function ActivitiesBlockView({ block }: { block: ActivitiesBlock }) {
  const entries = [...block.props.entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="w-full my-6 space-y-4" aria-label={block.props.title || "Activities"}>
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="font-display text-step-xl">{block.props.title || "Activities"}</h3>
      </div>
      <p className="text-xs text-ink-2">Updates shared by the product owner.</p>
      {entries.length === 0 ? <p className="text-sm text-ink-2">No activities shared yet.</p> : (
        <ol className="space-y-3">
          {entries.map((entry, index) => (
            <li key={`${entry.date}-${index}`}>
              <Card className="p-5 space-y-2">
                <time dateTime={entry.date} className="text-xs text-ink-2">{entry.date}</time>
                <h4 className="font-semibold">{entry.title}</h4>
                {entry.description && <p className="text-sm text-ink-2 whitespace-pre-wrap">{entry.description}</p>}
                {entry.url && /^https?:\/\//i.test(entry.url) && <a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-primary underline">Read update</a>}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
