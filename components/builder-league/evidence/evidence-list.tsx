import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { EvidenceCopy } from "@/content/builder-league/evidence-copy";
import { isEventTypeKey, type EvidenceStatus } from "@/lib/builder-league/types";
import { StatusBadge, formatLeagueDate } from "./evidence-ui";

export interface EvidenceListItem {
  id: string;
  eventType: string;
  title: string;
  status: EvidenceStatus;
  occurredAt: string;
  projectName: string | null;
  decision: { reasonCodes: string[]; note: string | null } | null;
  appealStatus: string | null;
}

export function eventLabel(copy: EvidenceCopy, eventType: string): string {
  return isEventTypeKey(eventType) ? copy.events[eventType] : eventType;
}

/** Decision reasons as the member reads them: localized reason labels plus the moderator's note. */
export function DecisionSummary({ copy, decision }: { copy: EvidenceCopy; decision: EvidenceListItem["decision"] }) {
  if (!decision || (decision.reasonCodes.length === 0 && !decision.note)) return null;
  return (
    <div className="space-y-1 text-step-sm text-ink-2">
      {decision.reasonCodes.length > 0 ? <p>{decision.reasonCodes.map((code) => copy.reasons[code] ?? code).join(" · ")}</p> : null}
      {decision.note ? <p className="whitespace-pre-line text-foreground">{decision.note}</p> : null}
    </div>
  );
}

export function EvidenceList({ copy, locale, items }: { copy: EvidenceCopy; locale: string; items: EvidenceListItem[] }) {
  return (
    <ol className="surface-panel divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6 sm:p-6">
          <div className="min-w-0 space-y-2">
            <p className="mono-label text-ink-3">{eventLabel(copy, item.eventType)}</p>
            <h2 className="text-step-base font-medium">
              <Link href={`/builder-league/evidence/${item.id}`} className="break-words hover:text-primary hover:underline hover:underline-offset-4">
                {item.title}
              </Link>
            </h2>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-step-xs text-ink-3">
              <div className="flex gap-1.5">
                <dt>{copy.list.occurred}</dt>
                <dd className="text-ink-2">{formatLeagueDate(locale, item.occurredAt)}</dd>
              </div>
              {item.projectName ? (
                <div className="flex min-w-0 gap-1.5">
                  <dt>{copy.list.project}</dt>
                  <dd className="truncate text-ink-2">{item.projectName}</dd>
                </div>
              ) : null}
            </dl>
            {item.status === "rejected" || item.status === "needs_info" ? <DecisionSummary copy={copy} decision={item.decision} /> : null}
            {item.appealStatus ? <p className="text-step-xs text-ink-2">{copy.appeal.statuses[item.appealStatus] ?? item.appealStatus}</p> : null}
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
            <StatusBadge copy={copy} status={item.status} />
            <Link
              href={`/builder-league/evidence/${item.id}`}
              className="inline-flex items-center gap-1 text-step-sm text-primary underline-offset-4 hover:underline"
              aria-label={`${copy.list.open}: ${item.title}`}
            >
              {copy.list.open}
              <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
