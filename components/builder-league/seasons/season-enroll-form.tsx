"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

interface TrackOption {
  value: string;
  label: string;
  hint: string;
}

interface SeasonEnrollFormProps {
  seasonKey: string;
  tracks: TrackOption[];
  initialTrack: string;
  initialGoal: string;
  goalMax: number;
  labels: { track: string; goal: string; goalHint: string; submit: string; saving: string; saved: string; error: string };
}

/** Optional season enrollment: a track and a one-line goal. Never changes scoring. */
export function SeasonEnrollForm({ seasonKey, tracks, initialTrack, initialGoal, goalMax, labels }: SeasonEnrollFormProps) {
  const router = useRouter();
  const [track, setTrack] = useState(initialTrack);
  const [goal, setGoal] = useState(initialGoal);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    try {
      const response = await fetch("/api/v1/builder-seasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seasonKey, track, goal: goal.trim() || null }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="mono-label text-ink-2">{labels.track}</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line p-3 transition-colors duration-base has-[:checked]:border-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="track"
                value={option.value}
                checked={track === option.value}
                onChange={() => setTrack(option.value)}
                className="mt-1 accent-[hsl(var(--primary))]"
              />
              <span className="space-y-0.5">
                <span className="block font-medium">{option.label}</span>
                <span className="block text-step-sm text-ink-3">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="season-goal" className="mono-label block text-ink-2">
          {labels.goal}
        </label>
        <input
          id="season-goal"
          type="text"
          value={goal}
          maxLength={goalMax}
          onChange={(event) => setGoal(event.target.value)}
          aria-describedby="season-goal-hint"
          className="min-h-11 w-full rounded-sm border border-line-strong bg-background px-3 text-foreground focus-ring"
        />
        <p id="season-goal-hint" className="text-step-sm text-ink-3">
          {labels.goalHint}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary btn-sm focus-ring" disabled={state === "saving"}>
          {state === "saving" ? labels.saving : labels.submit}
        </button>
        <p role="status" aria-live="polite" className="text-step-sm text-ink-2">
          {state === "saved" ? labels.saved : state === "error" ? labels.error : ""}
        </p>
      </div>
    </form>
  );
}
