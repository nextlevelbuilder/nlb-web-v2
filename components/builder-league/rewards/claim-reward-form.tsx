"use client";

import { useId, useState } from "react";
import { useRouter } from "@/i18n/navigation";

interface ClaimRewardFormProps {
  rewardId: string;
  labels: { note: string; notePlaceholder: string; claim: string; claiming: string; claimed: string };
  /** Message per API error code, with `default` as the fallback. */
  errors: Record<string, string>;
}

/** Requests a reward. Eligibility, stock and the one-per-period rule are enforced by the API. */
export function ClaimRewardForm({ rewardId, labels, errors }: ClaimRewardFormProps) {
  const router = useRouter();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "done" | "error"; message?: string }>({ kind: "idle" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: "saving" });
    try {
      const response = await fetch(`/api/v1/builder-rewards/${encodeURIComponent(rewardId)}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note.trim() || null }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
        setState({ kind: "error", message: errors[body?.error?.code ?? ""] ?? errors.default });
        return;
      }
      setState({ kind: "done" });
      router.refresh();
    } catch {
      setState({ kind: "error", message: errors.default });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={noteId} className="mono-label block text-ink-2">
          {labels.note}
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={500}
          rows={2}
          placeholder={labels.notePlaceholder}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-sm border border-line-strong bg-background p-3 text-step-sm text-foreground placeholder:text-ink-3 focus-ring"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary btn-sm focus-ring" disabled={state.kind === "saving" || state.kind === "done"}>
          {state.kind === "saving" ? labels.claiming : labels.claim}
        </button>
        <p role="status" aria-live="polite" className="text-step-sm text-ink-2">
          {state.kind === "done" ? labels.claimed : state.kind === "error" ? state.message : ""}
        </p>
      </div>
    </form>
  );
}
