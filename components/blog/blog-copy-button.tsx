"use client";

/**
 * Copy-to-clipboard pill for code blocks and the share row. It renders only after hydration, so a
 * reader without JavaScript never meets a dead button (the code stays selectable and the share links
 * stay plain anchors). The clipboard write starts synchronously inside the click handler, which keeps
 * the user-activation that Safari and Firefox require.
 */
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

const subscribe = () => () => {};

export interface BlogCopyButtonProps {
  text: string;
  /** Accessible name, e.g. "Copy code" or "Copy link". */
  label: string;
  idleText: string;
  copiedText: string;
  failedText: string;
  className?: string;
}

export function BlogCopyButton({ text, label, idleText, copiedText, failedText, className }: BlogCopyButtonProps) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const reset = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(reset);
  }, [state]);

  if (!hydrated) return null;

  const onClick = () => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      setState("failed");
      return;
    }
    clipboard.writeText(text).then(
      () => setState("copied"),
      (error: unknown) => {
        console.warn("Clipboard write failed:", error);
        setState("failed");
      },
    );
  };

  return (
    <>
      <button type="button" className={cn("blog-copy", state === "copied" && "is-ok", className)} onClick={onClick} aria-label={label}>
        <span aria-hidden="true">{state === "copied" ? copiedText : state === "failed" ? failedText : idleText}</span>
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? copiedText : state === "failed" ? failedText : ""}
      </span>
    </>
  );
}
