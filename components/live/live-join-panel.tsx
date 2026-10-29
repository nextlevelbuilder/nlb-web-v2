"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getLiveCopy } from "@/lib/live/live-copy";
import { liveApi, parseApiDate, safeExternalUrl } from "./live-api-client";
import { formatLiveTime } from "./live-ui-helpers";

type JoinStatus = "too_early" | "open" | "ended" | "not_ready" | "meeting_not_ready" | "no_ticket";

type JoinState =
  | { kind: "checking" }
  | { kind: "error" }
  | { kind: "sign_in" }
  | { kind: JoinStatus; joinUrl: string | null; opensAt: Date | null; endsAt: Date | null };

const STATUSES: ReadonlySet<string> = new Set<JoinStatus>(["too_early", "open", "ended", "not_ready", "meeting_not_ready", "no_ticket"]);
/** setTimeout cannot wait longer than ~24.8 days; only auto-recheck within a day. */
const MAX_AUTO_RECHECK_MS = 24 * 60 * 60 * 1000;

/**
 * Join access for a ticket holder. The join URL is never in the server HTML: it comes only from the
 * authorized `GET /api/v1/live/events/{slug}/join` call, and the button is active only while that
 * endpoint answers `open`. Before the window opens the panel re-checks itself when it opens.
 */
export function LiveJoinPanel({ slug, locale, timeZone, signInHref }: { slug: string; locale: string; timeZone: string; signInHref: string }) {
  const copy = getLiveCopy(locale);
  const [state, setState] = useState<JoinState>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);
  const recheck = useCallback(() => {
    setState({ kind: "checking" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    liveApi<{ status?: unknown; joinUrl?: unknown; opensAt?: unknown; endsAt?: unknown }>(
      `/api/v1/live/events/${encodeURIComponent(slug)}/join`,
      { signal: controller.signal }
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          // 401: the session is gone, so offer sign-in rather than a generic error.
          if (result.status === 401) setState({ kind: "sign_in" });
          else setState(result.status === 403 || result.status === 404 ? { kind: "no_ticket", joinUrl: null, opensAt: null, endsAt: null } : { kind: "error" });
          return;
        }
        const status = typeof result.data.status === "string" && STATUSES.has(result.data.status) ? (result.data.status as JoinStatus) : null;
        if (!status) {
          setState({ kind: "error" });
          return;
        }
        const joinUrl = status === "open" ? safeExternalUrl(result.data.joinUrl) : null;
        setState({
          // An "open" answer without a usable URL is treated as not ready rather than a dead button.
          kind: status === "open" && !joinUrl ? "not_ready" : status,
          joinUrl,
          opensAt: parseApiDate(result.data.opensAt),
          endsAt: parseApiDate(result.data.endsAt),
        });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [slug, attempt]);

  // Re-check automatically when the join window opens.
  useEffect(() => {
    if (state.kind !== "too_early" || !state.opensAt) return;
    const wait = state.opensAt.getTime() - Date.now();
    if (wait > MAX_AUTO_RECHECK_MS) return;
    const timer = window.setTimeout(recheck, Math.max(1000, wait + 1000));
    return () => window.clearTimeout(timer);
  }, [state, recheck]);

  let body: ReactNode;
  switch (state.kind) {
    case "checking":
      body = <p className="live-note">{copy.joinChecking}</p>;
      break;
    case "open":
      body = (
        <>
          <a className="btn btn-primary live-cta-btn" href={state.joinUrl ?? undefined} target="_blank" rel="noopener noreferrer">
            {copy.joinButton} <span className="sr-only">{copy.newTab}</span>
          </a>
          {state.endsAt && <p className="live-note">{copy.joinOpenUntil(formatLiveTime(state.endsAt, timeZone))}</p>}
        </>
      );
      break;
    case "too_early":
      body = (
        <>
          <button type="button" className="btn btn-primary live-cta-btn" disabled aria-disabled="true">{copy.joinButton}</button>
          {state.opensAt && <p className="live-note">{copy.joinOpensAt(formatLiveTime(state.opensAt, timeZone))}</p>}
        </>
      );
      break;
    case "ended":
      body = <p className="live-note">{copy.joinEnded}</p>;
      break;
    case "sign_in":
      body = (
        <>
          <p className="live-note">{copy.joinSignIn}</p>
          <Link className="btn btn-primary live-cta-btn" href={signInHref}>{copy.joinSignInButton}</Link>
        </>
      );
      break;
    default: {
      const message =
        state.kind === "not_ready" ? copy.joinNotReady
          : state.kind === "meeting_not_ready" ? copy.joinMeetingNotReady
            : state.kind === "no_ticket" ? copy.joinNoTicket
              : copy.joinError;
      body = (
        <>
          <p className="live-note">{message}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={recheck}>{copy.checkAgain}</button>
        </>
      );
    }
  }

  return (
    <div className="live-join" aria-live="polite" aria-busy={state.kind === "checking"}>
      {body}
    </div>
  );
}
