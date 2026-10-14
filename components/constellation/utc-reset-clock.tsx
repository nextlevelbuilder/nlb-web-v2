'use client';

import { nextUtcMidnight } from '@/lib/home/countdown-schedule';
import { useNow } from '@/components/home/use-now';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** HH:MM:SS until the organic leaderboard resets at 00:00 UTC. "--:--:--" until hydrated. */
export default function UtcResetClock() {
  const now = useNow();
  let label = '--:--:--';
  if (now !== null) {
    const s = Math.max(0, Math.floor((nextUtcMidnight(now) - now) / 1000));
    label = `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  }
  return <b className="num-tab" suppressHydrationWarning>{label}</b>;
}
