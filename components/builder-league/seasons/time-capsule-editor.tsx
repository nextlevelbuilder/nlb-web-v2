"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

type Visibility = "private" | "community" | "public";

interface TimeCapsuleEditorProps {
  year: number;
  kind: "intent" | "reflection";
  heading: string;
  hint: string;
  initialBody: string;
  initialVisibility: Visibility;
  maxLength: number;
  visibilityOptions: { value: Visibility; label: string }[];
  labels: { visibility: string; save: string; saving: string; saved: string; error: string; characters: string };
}

/** Saves a new version of the intent or reflection; earlier versions stay in the history. */
export function TimeCapsuleEditor({
  year,
  kind,
  heading,
  hint,
  initialBody,
  initialVisibility,
  maxLength,
  visibilityOptions,
  labels,
}: TimeCapsuleEditorProps) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const base = `capsule-${kind}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    try {
      const response = await fetch("/api/v1/builder-time-capsule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, kind, body, visibility }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="surface-panel min-w-0 space-y-4 p-5 sm:p-6" aria-labelledby={`${base}-heading`}>
      <div className="space-y-1">
        <h2 id={`${base}-heading`} className="font-display text-step-xl">
          {heading}
        </h2>
        <p id={`${base}-hint`} className="text-step-sm text-ink-3">
          {hint}
        </p>
      </div>
      <textarea
        id={`${base}-body`}
        aria-labelledby={`${base}-heading`}
        aria-describedby={`${base}-hint ${base}-count`}
        value={body}
        maxLength={maxLength}
        rows={7}
        required
        onChange={(event) => setBody(event.target.value)}
        className="w-full rounded-sm border border-line-strong bg-background p-3 text-foreground focus-ring"
      />
      <p id={`${base}-count`} className="text-right font-mono text-step-xs text-ink-3 num-tab">
        {labels.characters.replace("{used}", String(body.length))}
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 max-w-full space-y-1.5">
          <label htmlFor={`${base}-visibility`} className="mono-label block text-ink-2">
            {labels.visibility}
          </label>
          <select
            id={`${base}-visibility`}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as Visibility)}
            className="min-h-11 w-full max-w-full rounded-sm border border-line-strong bg-background px-3 text-foreground focus-ring"
          >
            {visibilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary btn-sm focus-ring" disabled={state === "saving" || !body.trim()}>
          {state === "saving" ? labels.saving : labels.save}
        </button>
        <p role="status" aria-live="polite" className="text-step-sm text-ink-2">
          {state === "saved" ? labels.saved : state === "error" ? labels.error : ""}
        </p>
      </div>
    </form>
  );
}
