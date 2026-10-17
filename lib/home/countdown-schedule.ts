/**
 * Pure time helpers for the homepage countdowns. All functions take `now` explicitly so the
 * components stay deterministic and the maths is unit-testable.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** true once the target is reached; every unit is then 0. */
  done: boolean;
}

/** Split the time remaining until `target` into whole units. Never negative. */
export function countdownParts(target: number, now: number): CountdownParts {
  const remaining = Math.max(0, target - now);
  return {
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
    seconds: Math.floor((remaining % MINUTE) / SECOND),
    done: remaining === 0,
  };
}

/** The next 00:00 UTC strictly after `now` (the organic leaderboard reset). */
export function nextUtcMidnight(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

/** Vietnam time (UTC+7, no DST): the weekly video schedule is set in the team's timezone. */
const SCHEDULE_OFFSET = 7 * HOUR;

/** Whole days until the next weekly drop on `weekday` (0 = Sunday … 1 = Monday), in UTC+7. 0 = today. */
export function daysUntilWeekday(now: number, weekday = 1): number {
  const local = new Date(now + SCHEDULE_OFFSET);
  return (weekday - local.getUTCDay() + 7) % 7;
}
