'use client';

import { countdownParts, nextUtcMidnight } from '@/lib/home/countdown-schedule';
import { useNow } from './use-now';

const pad = (value: number) => String(value).padStart(2, '0');

/** HH:MM:SS until the organic leaderboard resets at 00:00 UTC. */
export default function LeaderboardResetCountdown({ label }: { label: string }) {
  const now = useNow();
  const parts = now === null ? null : countdownParts(nextUtcMidnight(now), now);
  return (
    <p className="flex flex-wrap items-baseline gap-3">
      <span className="mono-label text-ink-3">{label}</span>
      <span className="num-tab font-mono text-step-lg text-foreground">
        {parts ? `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}` : '--:--:--'}
        <span className="ml-1.5 text-step-xs text-ink-3">UTC</span>
      </span>
    </p>
  );
}
