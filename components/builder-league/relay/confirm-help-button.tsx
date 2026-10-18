"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

/** Confirms help another builder logged for you, through the evidence confirmation endpoint. */
export function ConfirmHelpButton({
  evidenceId,
  labels,
}: {
  evidenceId: string;
  labels: { confirm: string; confirming: string; confirmed: string; error: string };
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-ghost btn-sm focus-ring"
        disabled={state === "saving" || state === "done"}
        onClick={async () => {
          setState("saving");
          try {
            const response = await fetch(`/api/v1/builder-evidence/${encodeURIComponent(evidenceId)}/confirm`, { method: "POST" });
            if (!response.ok) throw new Error(String(response.status));
            setState("done");
            router.refresh();
          } catch {
            setState("error");
          }
        }}
      >
        {state === "saving" ? labels.confirming : labels.confirm}
      </button>
      <p role="status" aria-live="polite" className="text-step-sm text-ink-2">
        {state === "done" ? labels.confirmed : state === "error" ? labels.error : ""}
      </p>
    </div>
  );
}
