"use client";

import { useSyncExternalStore } from "react";
import { getLiveCopy } from "@/lib/live/live-copy";
import { timeLeftParts } from "./live-ui-helpers";

const TICK_MS = 30_000;

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(timer);
}

/** Current time bucketed to the tick, so the snapshot is stable between renders. */
const clientNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const serverNow = () => null;

/**
 * Relative countdown ("2d 4h left") next to a server-rendered absolute date. Rendered only on the
 * client (null in server HTML, so no hydration mismatch) and not announced: the absolute date is the
 * accessible source of truth.
 */
export function LiveTimeLeft({ target, locale }: { target: string; locale: string }) {
  const now = useSyncExternalStore(subscribe, clientNow, serverNow);
  if (now === null) return null;
  const parts = timeLeftParts(new Date(target), new Date(now));
  if (parts.totalMs <= 0) return null;
  return <span className="live-time-left" aria-hidden="true">{getLiveCopy(locale).timeLeft(parts)}</span>;
}
