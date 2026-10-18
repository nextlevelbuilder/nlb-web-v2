"use client";

import { useState } from "react";

/** Copies a badge's share-card text. The text is built on the server and never includes evidence. */
export function ShareCardButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-arrow font-mono text-step-xs uppercase tracking-[0.08em] focus-ring"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {label}
      <span role="status" aria-live="polite" className="text-ink-3">
        {copied ? `· ${copiedLabel}` : ""}
      </span>
    </button>
  );
}
