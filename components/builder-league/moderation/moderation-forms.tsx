import { Button } from "@/components/ui/button";
import type { EvidenceCopy } from "@/content/builder-league/evidence-copy";
import { DECISION_REASON_CODES, type Decision } from "@/lib/builder-league/moderation";
import { EVENT_TYPE_KEYS, EVIDENCE_STATUSES, STAGES } from "@/lib/builder-league/types";
import { fieldClass, hintClass, labelClass } from "@/components/builder-league/evidence/evidence-ui";

/**
 * Moderator forms. Each is a plain HTML form posting to the admin API with `returnTo`, so moderation
 * works without JavaScript; the API refuses API keys, agents and decisions on one's own evidence.
 */

export interface QueueFilterValues {
  status: string;
  stage?: string;
  eventType?: string;
  olderThanHours?: number;
}

const AGE_OPTIONS = [24, 72, 168];

export function QueueFilters({ copy, values, action }: { copy: EvidenceCopy; values: QueueFilterValues; action: string }) {
  return (
    <form action={action} method="get" aria-label={copy.moderation.filters} className="surface-panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
      <div>
        <label htmlFor="filter-status" className={labelClass}>
          {copy.moderation.status}
        </label>
        <select id="filter-status" name="status" defaultValue={values.status} className={`${fieldClass} mt-2`}>
          {EVIDENCE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {copy.statuses[status]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-stage" className={labelClass}>
          {copy.moderation.stage}
        </label>
        <select id="filter-stage" name="stage" defaultValue={values.stage ?? ""} className={`${fieldClass} mt-2`}>
          <option value="">{copy.form.stageAll}</option>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {copy.stages[stage]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-event" className={labelClass}>
          {copy.moderation.eventType}
        </label>
        <select id="filter-event" name="eventType" defaultValue={values.eventType ?? ""} className={`${fieldClass} mt-2`}>
          <option value="">{copy.list.filterAll}</option>
          {EVENT_TYPE_KEYS.map((key) => (
            <option key={key} value={key}>
              {copy.events[key]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-age" className={labelClass}>
          {copy.moderation.olderThan}
        </label>
        <select id="filter-age" name="olderThanHours" defaultValue={values.olderThanHours?.toString() ?? ""} className={`${fieldClass} mt-2`}>
          <option value="">{copy.moderation.anyAge}</option>
          {AGE_OPTIONS.map((hours) => (
            <option key={hours} value={hours}>
              {hours % 24 === 0 ? copy.moderation.days(hours / 24) : copy.moderation.hours(hours)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline">
        {copy.moderation.apply}
      </Button>
    </form>
  );
}

function ReasonFields({ copy, decision, idPrefix }: { copy: EvidenceCopy; decision: Decision; idPrefix: string }) {
  return (
    <fieldset className="space-y-3">
      <legend className={labelClass}>{copy.moderation.reasonsLabel(decision)}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {DECISION_REASON_CODES[decision].map((code) => (
          <label key={code} htmlFor={`${idPrefix}-${code}`} className="flex items-start gap-2 text-step-sm">
            <input id={`${idPrefix}-${code}`} type="checkbox" name="reasonCodes" value={code} className="mt-1 h-4 w-4 accent-primary" />
            {copy.reasons[code] ?? code}
          </label>
        ))}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-note`} className={labelClass}>
          {copy.moderation.noteLabel}
        </label>
        <textarea id={`${idPrefix}-note`} name="note" rows={3} maxLength={2000} aria-describedby={`${idPrefix}-note-hint`} className={`${fieldClass} mt-2`} />
        <p id={`${idPrefix}-note-hint`} className={hintClass}>
          {copy.moderation.noteHint}
        </p>
      </div>
    </fieldset>
  );
}

/**
 * Approve, reject or ask for information: one small form per decision, so the reason codes offered
 * always belong to the decision being sent.
 */
export function DecisionForms({ copy, evidenceId, returnTo, canApprove }: { copy: EvidenceCopy; evidenceId: string; returnTo: string; canApprove: boolean }) {
  const action = `/api/v1/builder-admin/evidence/${evidenceId}/decision`;
  const decisions: Decision[] = canApprove ? ["approve", "reject", "needs_info"] : ["reject", "needs_info"];
  return (
    <div className="space-y-3">
      {decisions.map((decision) => (
        <details key={decision} className="rounded-sm border border-line">
          <summary className="cursor-pointer px-4 py-2.5 text-step-sm font-medium">{copy.moderation.decisions[decision]}</summary>
          <form action={action} method="post" className="space-y-4 border-t border-line p-4">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="decision" value={decision} />
            <ReasonFields copy={copy} decision={decision} idPrefix={`${evidenceId}-${decision}`} />
            <Button type="submit" variant={decision === "approve" ? "primary" : "outline"} size="sm">
              {copy.moderation.decisions[decision]}
            </Button>
          </form>
        </details>
      ))}
    </div>
  );
}

export function AppealResolutionForm({ copy, evidenceId, appealId, returnTo }: { copy: EvidenceCopy; evidenceId: string; appealId: string; returnTo: string }) {
  const fieldId = `appeal-${appealId}-resolution`;
  return (
    <form action={`/api/v1/builder-admin/evidence/${evidenceId}/appeal`} method="post" className="space-y-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="appealId" value={appealId} />
      <div>
        <label htmlFor={fieldId} className={labelClass}>
          {copy.moderation.resolutionLabel}
        </label>
        <textarea id={fieldId} name="resolution" required minLength={5} maxLength={2000} rows={3} className={`${fieldClass} mt-2`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="outcome" value="overturn" variant="primary" size="sm">
          {copy.moderation.overturn}
        </Button>
        <Button type="submit" name="outcome" value="uphold" variant="outline" size="sm">
          {copy.moderation.uphold}
        </Button>
      </div>
    </form>
  );
}

export function ReverseForm({ copy, entryId, returnTo }: { copy: EvidenceCopy; entryId: string; returnTo: string }) {
  const fieldId = `reverse-${entryId}`;
  return (
    <details className="rounded-sm border border-line">
      <summary className="cursor-pointer px-4 py-2.5 text-step-sm font-medium">{copy.moderation.reverseTitle}</summary>
      <form action={`/api/v1/builder-admin/ledger/${encodeURIComponent(entryId)}/reverse`} method="post" className="space-y-3 border-t border-line p-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <p className="text-step-xs text-ink-2">{copy.moderation.reverseLede}</p>
        <div>
          <label htmlFor={fieldId} className={labelClass}>
            {copy.moderation.reasonLabel}
          </label>
          <textarea id={fieldId} name="reason" required minLength={5} maxLength={1000} rows={2} className={`${fieldClass} mt-2`} />
        </div>
        <Button type="submit" variant="destructive" size="sm">
          {copy.moderation.reverse}
        </Button>
      </form>
    </details>
  );
}

export interface PilotRow {
  userId: string;
  name: string | null;
  email: string | null;
  note: string | null;
  addedAt: Date;
}

export function PilotPanel({ copy, rows, returnTo, formatDate }: { copy: EvidenceCopy; rows: PilotRow[]; returnTo: string; formatDate: (value: Date) => string }) {
  return (
    <section aria-labelledby="pilot-title" className="surface-panel space-y-5 p-6">
      <div>
        <h2 id="pilot-title" className="h-section">
          {copy.moderation.pilotTitle}
        </h2>
        <p className="mt-1 text-step-sm text-ink-2">{copy.moderation.pilotLede}</p>
      </div>
      <form action="/api/v1/builder-admin/pilot" method="post" className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="action" value="add" />
        <div>
          <label htmlFor="pilot-email" className={labelClass}>
            {copy.moderation.pilotIdentity}
          </label>
          <input id="pilot-email" name="email" type="email" required autoComplete="off" className={`${fieldClass} mt-2`} />
        </div>
        <div>
          <label htmlFor="pilot-note" className={labelClass}>
            {copy.moderation.pilotNote}
          </label>
          <input id="pilot-note" name="note" maxLength={500} className={`${fieldClass} mt-2`} />
        </div>
        <Button type="submit" variant="outline">
          {copy.moderation.pilotAdd}
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="text-step-sm text-ink-2">{copy.moderation.pilotEmpty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.userId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-step-sm font-medium">{row.name ?? row.userId}</p>
                <p className="truncate font-mono text-step-xs text-ink-3">
                  {row.email ?? row.userId} · {copy.moderation.addedAt} {formatDate(row.addedAt)}
                </p>
                {row.note ? <p className="text-step-xs text-ink-2">{row.note}</p> : null}
              </div>
              <form action="/api/v1/builder-admin/pilot" method="post">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="action" value="remove" />
                <input type="hidden" name="userId" value={row.userId} />
                <Button type="submit" variant="ghost" size="sm" aria-label={`${copy.moderation.pilotRemove}: ${row.name ?? row.userId}`}>
                  {copy.moderation.pilotRemove}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BackfillForm({ copy, returnTo }: { copy: EvidenceCopy; returnTo: string }) {
  return (
    <section aria-labelledby="backfill-title" className="surface-panel space-y-5 p-6">
      <div>
        <h2 id="backfill-title" className="h-section">
          {copy.hub.backfillTitle}
        </h2>
        <p className="mt-1 max-w-[70ch] text-step-sm text-ink-2">{copy.hub.backfillLede}</p>
      </div>
      <form action="/api/v1/builder-admin/backfill" method="post" className="space-y-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <label htmlFor="backfill-users" className={labelClass}>
            {copy.hub.backfillUsers}
          </label>
          <textarea id="backfill-users" name="userIds" rows={3} aria-describedby="backfill-users-hint" className={`${fieldClass} mt-2 font-mono`} />
          <p id="backfill-users-hint" className={hintClass}>
            {copy.hub.backfillUsersHint}
          </p>
        </div>
        <label htmlFor="backfill-apply" className="flex items-start gap-2 text-step-sm">
          <input type="hidden" name="dryRun" value="true" />
          <input id="backfill-apply" type="checkbox" name="dryRun" value="false" className="mt-1 h-4 w-4 accent-primary" />
          {copy.hub.backfillApply}
        </label>
        <Button type="submit" variant="outline">
          {copy.hub.backfillRun}
        </Button>
      </form>
    </section>
  );
}
