"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getCoursesCopy } from "@/lib/courses/courses-copy";

interface CourseVideoPlayerProps {
  slug: string;
  title: string;
  locale: string;
}

type PlayerState =
  | { kind: "loading" }
  | { kind: "ready"; iframeUrl: string }
  | { kind: "error"; message: string };

interface TokenResponse {
  data?: { iframeUrl?: unknown };
}

/** Fetches a short-lived signed Stream URL from the token endpoint and embeds the Stream player. */
export function CourseVideoPlayer({ slug, title, locale }: CourseVideoPlayerProps) {
  const copy = getCoursesCopy(locale);
  const [state, setState] = useState<PlayerState>({ kind: "loading" });

  // Bumping `attempt` re-runs the effect; state is only set from async callbacks, never synchronously.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(`/api/courses/videos/${encodeURIComponent(slug)}/token`, {
          method: "POST",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!res.ok) {
          setState({ kind: "error", message: res.status === 503 ? copy.unavailable : copy.playerError });
          return;
        }
        const body = (await res.json()) as TokenResponse;
        const iframeUrl = body.data?.iframeUrl;
        if (typeof iframeUrl !== "string" || !iframeUrl.startsWith("https://")) {
          setState({ kind: "error", message: copy.playerError });
          return;
        }
        setState({ kind: "ready", iframeUrl });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Course player token request failed:", error);
        setState({ kind: "error", message: copy.playerError });
      }
    }
    void load();
    return () => controller.abort();
  }, [slug, attempt, copy.playerError, copy.unavailable]);

  function retry() {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }

  return (
    <div className="surface-panel relative aspect-video w-full overflow-hidden bg-canvas-deep">
      {state.kind === "ready" && (
        <iframe
          src={state.iframeUrl}
          title={title}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
      {state.kind === "loading" && (
        <p role="status" className="mono-label absolute inset-0 flex items-center justify-center text-ink-2">
          {copy.loadingPlayer}
        </p>
      )}
      {state.kind === "error" && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-step-sm text-ink-2">{state.message}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            {copy.retry}
          </Button>
        </div>
      )}
    </div>
  );
}
