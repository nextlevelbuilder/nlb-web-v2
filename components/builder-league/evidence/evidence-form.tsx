"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { CircleAlert, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { evidenceErrorMessage, getEvidenceCopy } from "@/content/builder-league/evidence-copy";
import type { EventTypeKey, Stage, Visibility } from "@/lib/builder-league/types";
import { VISIBILITIES } from "@/lib/builder-league/types";
import { fieldClass, hintClass, labelClass } from "./evidence-ui";

export interface EventOption {
  key: EventTypeKey;
  stage: Stage;
  rp: number;
  requirements: string[];
  minSummary: number;
  counterparty: boolean;
  needsProject: boolean;
}

export interface EvidenceFormValues {
  eventType?: string;
  projectId?: string | null;
  occurredAt: string;
  title?: string;
  summary?: string;
  links?: string[];
  counterparty?: string | null;
  visibility: Visibility;
}

interface EvidenceFormProps {
  locale: string;
  mode: "create" | "edit";
  /** API endpoint the form posts to (works without JavaScript through a 303 redirect). */
  action: string;
  /** Page the API redirects back to with `?error=` when JavaScript is off. */
  returnTo: string;
  events: EventOption[];
  projects: { id: string; name: string }[];
  initial: EvidenceFormValues;
  maxDate: string;
  clientKey?: string;
  existingFiles?: { name: string; url: string }[];
}

interface ErrorState {
  message: string;
  fields: string[];
}

/**
 * Evidence form for submitting and editing. It is a plain multipart form that posts to the API, so it
 * works without JavaScript; when JavaScript runs it submits in place, keeps the typed values on errors
 * and shows the selected event's requirements as the member picks it.
 */
export default function EvidenceForm({ locale, mode, action, returnTo, events, projects, initial, maxDate, clientKey, existingFiles = [] }: EvidenceFormProps) {
  const copy = getEvidenceCopy(locale);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [eventType, setEventType] = useState(initial.eventType ?? "");
  const [summaryLength, setSummaryLength] = useState(initial.summary?.length ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const selected = useMemo(() => events.find((event) => event.key === eventType), [events, eventType]);
  const stages = useMemo(() => [...new Set(events.map((event) => event.stage))], [events]);
  const fieldId = (name: string) => `${id}-${name}`;
  const invalid = (name: string) => (error?.fields.includes(name) ? true : undefined);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(action, { method: "POST", body: new FormData(event.currentTarget), headers: { accept: "application/json" } });
      const body = (await response.json().catch(() => null)) as {
        data?: { id: string };
        error?: { code?: string; details?: unknown };
      } | null;
      if (response.ok && body?.data) {
        const prefix = locale === "vi" ? "/vi" : "";
        const target = mode === "create" ? `${prefix}/builder-league/evidence/${body.data.id}?notice=submitted` : `${returnTo}?notice=updated`;
        window.location.assign(target);
        return;
      }
      const details = Array.isArray(body?.error?.details) ? (body.error.details as { path?: string }[]) : [];
      setError({
        message: evidenceErrorMessage(copy, body?.error?.code),
        fields: details.map((detail) => String(detail.path ?? "").split(".")[0]).filter(Boolean),
      });
    } catch {
      setError({ message: copy.errorFallback, fields: [] });
    }
    setPending(false);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  return (
    <form
      ref={formRef}
      action={action}
      method="post"
      encType="multipart/form-data"
      onSubmit={onSubmit}
      className="space-y-7"
      aria-describedby={`${id}-redaction`}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      {clientKey ? <input type="hidden" name="clientKey" value={clientKey} /> : null}
      {mode === "edit" ? <input type="hidden" name="action" value="edit" /> : null}

      <p id={`${id}-redaction`} className="flex items-start gap-2 rounded-sm border border-warning/50 bg-warning/10 px-4 py-3 text-step-sm text-foreground">
        <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        {copy.form.redaction}
      </p>

      {error ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-sm border border-destructive/60 bg-destructive/10 px-4 py-3 text-step-sm focus:outline-none">
          <p className="flex items-start gap-2 font-medium">
            <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            {copy.form.errorSummary}
          </p>
          <p className="mt-1 text-ink-2">{error.message}</p>
        </div>
      ) : null}

      {mode === "create" ? (
        <div>
          <label htmlFor={fieldId("eventType")} className={labelClass}>
            {copy.form.typeLabel}
          </label>
          <select
            id={fieldId("eventType")}
            name="eventType"
            required
            value={eventType}
            onChange={(change) => setEventType(change.target.value)}
            aria-invalid={invalid("eventType")}
            aria-describedby={`${fieldId("eventType")}-hint ${fieldId("eventType")}-req`}
            className={`${fieldClass} mt-2`}
          >
            <option value="">{copy.form.typeChoose}</option>
            {stages.map((stage) => (
              <optgroup key={stage} label={copy.stages[stage]}>
                {events
                  .filter((event) => event.stage === stage)
                  .map((event) => (
                    <option key={event.key} value={event.key}>
                      {`${copy.events[event.key]} · ${copy.rp(event.rp)}`}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p id={`${fieldId("eventType")}-hint`} className={hintClass}>
            {copy.form.typeHint}
          </p>
          <div id={`${fieldId("eventType")}-req`} aria-live="polite">
            {selected ? (
              <div className="mt-3 rounded-sm border border-line bg-canvas-deep p-4">
                <p className="mono-label text-ink-3">
                  {copy.form.requirements} · {copy.rp(selected.rp)}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-step-sm text-ink-2">
                  {selected.requirements.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === "create" || selected?.needsProject ? (
        <div>
          <label htmlFor={fieldId("projectId")} className={labelClass}>
            {copy.form.projectLabel}
          </label>
          <select
            id={fieldId("projectId")}
            name="projectId"
            defaultValue={initial.projectId ?? ""}
            aria-invalid={invalid("projectId")}
            aria-describedby={`${fieldId("projectId")}-hint`}
            className={`${fieldClass} mt-2`}
          >
            <option value="">{copy.form.projectNone}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <p id={`${fieldId("projectId")}-hint`} className={hintClass}>
            {copy.form.projectHint}
          </p>
        </div>
      ) : null}

      <div className="grid gap-7 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div>
          <label htmlFor={fieldId("occurredAt")} className={labelClass}>
            {copy.form.occurredLabel}
          </label>
          <input
            id={fieldId("occurredAt")}
            type="date"
            name="occurredAt"
            required
            max={maxDate}
            defaultValue={initial.occurredAt}
            aria-invalid={invalid("occurredAt")}
            aria-describedby={`${fieldId("occurredAt")}-hint`}
            className={`${fieldClass} mt-2`}
          />
          <p id={`${fieldId("occurredAt")}-hint`} className={hintClass}>
            {copy.form.occurredHint}
          </p>
        </div>
        <div>
          <label htmlFor={fieldId("title")} className={labelClass}>
            {copy.form.titleLabel}
          </label>
          <input
            id={fieldId("title")}
            name="title"
            required
            minLength={3}
            maxLength={140}
            defaultValue={initial.title}
            aria-invalid={invalid("title")}
            className={`${fieldClass} mt-2`}
          />
        </div>
      </div>

      <div>
        <label htmlFor={fieldId("summary")} className={labelClass}>
          {copy.form.summaryLabel}
        </label>
        <textarea
          id={fieldId("summary")}
          name="summary"
          rows={7}
          maxLength={5000}
          defaultValue={initial.summary}
          onChange={(change) => setSummaryLength(change.target.value.trim().length)}
          aria-invalid={invalid("summary")}
          aria-describedby={`${fieldId("summary")}-hint ${fieldId("summary")}-count`}
          className={`${fieldClass} mt-2`}
        />
        <p id={`${fieldId("summary")}-hint`} className={hintClass}>
          {copy.form.summaryHint}
        </p>
        <p id={`${fieldId("summary")}-count`} className="mt-1 font-mono text-step-xs text-ink-3" aria-live="polite">
          {copy.form.charCount(summaryLength, selected?.minSummary ?? 0)}
        </p>
      </div>

      <div>
        <label htmlFor={fieldId("links")} className={labelClass}>
          {copy.form.linksLabel}
        </label>
        <textarea
          id={fieldId("links")}
          name="links"
          rows={3}
          inputMode="url"
          defaultValue={initial.links?.join("\n")}
          placeholder="https://"
          aria-invalid={invalid("links")}
          aria-describedby={`${fieldId("links")}-hint`}
          className={`${fieldClass} mt-2 font-mono`}
        />
        <p id={`${fieldId("links")}-hint`} className={hintClass}>
          {copy.form.linksHint}
        </p>
      </div>

      {existingFiles.length > 0 ? (
        <fieldset>
          <legend className={labelClass}>{copy.detail.files}</legend>
          <ul className="mt-2 space-y-2">
            {existingFiles.map((file) => (
              <li key={file.name} className="flex items-center gap-3 text-step-sm">
                <input id={`${id}-rm-${file.name}`} type="checkbox" name="removeFiles" value={file.name} className="h-4 w-4 accent-primary" />
                <label htmlFor={`${id}-rm-${file.name}`}>{copy.form.removeFile(file.name)}</label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <div>
        <label htmlFor={fieldId("files")} className={labelClass}>
          {copy.form.filesLabel}
        </label>
        <input
          id={fieldId("files")}
          type="file"
          name="files"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          aria-describedby={`${fieldId("files")}-hint`}
          className={`${fieldClass} mt-2 file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-step-xs file:text-secondary-foreground`}
        />
        <p id={`${fieldId("files")}-hint`} className={hintClass}>
          {copy.form.filesHint}
        </p>
      </div>

      {mode === "create" || selected?.counterparty ? (
        <div>
          <label htmlFor={fieldId("counterparty")} className={labelClass}>
            {copy.form.counterpartyLabel}
          </label>
          <input
            id={fieldId("counterparty")}
            name="counterparty"
            defaultValue={initial.counterparty ?? ""}
            autoComplete="off"
            aria-invalid={invalid("counterparty")}
            aria-describedby={`${fieldId("counterparty")}-hint`}
            className={`${fieldClass} mt-2`}
          />
          <p id={`${fieldId("counterparty")}-hint`} className={hintClass}>
            {copy.form.counterpartyHint}
          </p>
        </div>
      ) : null}

      <fieldset>
        <legend className={labelClass}>{copy.form.visibilityLabel}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {VISIBILITIES.map((visibility) => (
            <label key={visibility} className="flex cursor-pointer items-start gap-3 rounded-sm border border-line p-3 has-[:checked]:border-primary">
              <input type="radio" name="visibility" value={visibility} defaultChecked={initial.visibility === visibility} className="mt-1 h-4 w-4 accent-primary" />
              <span>
                <span className="block text-step-sm font-medium">{copy.visibility[visibility].label}</span>
                <span className="block text-step-xs text-ink-2">{copy.visibility[visibility].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
          {pending ? copy.form.submitting : mode === "create" ? copy.form.submit : copy.form.save}
        </Button>
      </div>
    </form>
  );
}
