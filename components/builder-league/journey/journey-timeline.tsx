import type { JourneyItem } from "@/lib/builder-league/journey";
import { eventTypeLabel, type JourneyCopy } from "@/content/builder-league/journey-copy";
import { formatLocalDate, formatMonthKey } from "./journey-format";

interface JourneyTimelineProps {
  items: JourneyItem[];
  copy: JourneyCopy;
  locale: string;
}

const STATE_TONE: Record<JourneyItem["state"], string> = {
  verified: "text-primary",
  self_reported: "text-ink-3",
  pending: "text-ink-2",
  needs_info: "text-ink-2",
  rejected: "text-ink-3 line-through",
  withdrawn: "text-ink-3",
  corrected: "text-ink-3",
  reversed: "text-ink-3",
  revoked: "text-ink-3",
};

export function journeyItemLabel(item: JourneyItem, copy: JourneyCopy): string {
  if (item.source === "rank" && item.rank) return `${copy.kinds.rank}: ${copy.ranks[item.rank]}`;
  if (item.source === "badge") return `${copy.kinds.badge}: ${item.badgeKey ?? ""}`;
  return item.title ?? eventTypeLabel(copy, item.eventType);
}

function kindLabel(item: JourneyItem, copy: JourneyCopy): string | null {
  if (item.kind === "correction") return copy.kinds.correction;
  if (item.kind === "reversal") return copy.kinds.reversal;
  if (item.kind === "adjustment") return copy.kinds.adjustment;
  if (item.source === "evidence") return copy.kinds.evidence;
  return null;
}

/** Server-rendered journey: one ordered list per month. Works without JavaScript. */
export default function JourneyTimeline({ items, copy, locale }: JourneyTimelineProps) {
  const months = new Map<string, JourneyItem[]>();
  for (const item of items) {
    const key = item.localDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  const byId = new Map(items.map((item) => [item.id, item]));

  return (
    <div className="space-y-12">
      {[...months.entries()].map(([month, monthItems]) => (
        <section key={month} aria-labelledby={`month-${month}`} className="space-y-4">
          <h3 id={`month-${month}`} className="plate">
            <span className="font-mono text-step-xs uppercase tracking-[0.2em] text-ink-2">{formatMonthKey(locale, month)}</span>
            <span aria-hidden className="rule" />
            <span className="coord font-mono text-step-xs text-ink-3">{copy.monthCount(monthItems.length)}</span>
          </h3>
          <ol className="relative space-y-3 border-l border-line pl-6">
            {monthItems.map((item) => {
              const kind = kindLabel(item, copy);
              return (
                <li key={item.id} id={`step-${item.id}`} tabIndex={-1} className="surface-panel relative scroll-mt-28 p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-5">
                  <span aria-hidden className={`absolute -left-[1.86rem] top-6 h-2.5 w-2.5 rounded-full border border-line ${item.state === "verified" ? "bg-primary" : "bg-background"}`} />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-step-xs uppercase tracking-[0.14em] text-ink-3">
                    <time dateTime={new Date(item.occurredAt).toISOString()}>{formatLocalDate(locale, item.occurredAt)}</time>
                    {item.stage && <span>{copy.stages[item.stage]}</span>}
                    {kind && <span>{kind}</span>}
                    {item.learning && <span className="text-primary">{copy.learning}</span>}
                    <span className={STATE_TONE[item.state]}>{copy.states[item.state]}</span>
                  </div>
                  <p className="mt-2 text-step-base font-medium text-ink">{journeyItemLabel(item, copy)}</p>
                  {item.title && item.source !== "rank" && item.source !== "badge" && (
                    <p className="text-step-sm text-ink-2">{eventTypeLabel(copy, item.eventType)}</p>
                  )}
                  {item.summary && <p className="mt-2 max-w-[65ch] text-step-sm text-ink-2">{item.summary}</p>}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-step-xs text-ink-3">
                    {item.projectName && <span>{item.projectName}</span>}
                    {item.rp !== 0 && <span className="font-mono">{copy.rp(item.rp)}</span>}
                    {item.provenance && <span>{copy.backfill(item.provenance.label, formatLocalDate(locale, item.provenance.importedAt))}</span>}
                  </div>
                  {item.relations.length > 0 && (
                    <ul className="mt-3 space-y-1 text-step-xs">
                      {item.relations.map((relation) => (
                        <li key={`${relation.type}-${relation.itemId}`}>
                          <a className="link-arrow" href={`#step-${relation.itemId}`}>
                            {copy.relations[relation.type]}
                            {byId.get(relation.itemId) ? `: ${journeyItemLabel(byId.get(relation.itemId)!, copy)}` : ""}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.links.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-3 text-step-xs">
                      {item.links.map((link) => (
                        <li key={link} className="min-w-0 max-w-full">
                          <a className="block truncate text-ink-2 underline underline-offset-4" href={link} rel="noopener noreferrer nofollow" target="_blank">{link.replace(/^https?:\/\//, "")}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
