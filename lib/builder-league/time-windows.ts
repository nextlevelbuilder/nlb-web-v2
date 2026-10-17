import type { PeriodType } from "./types";
import { SEASON_EPOCH, SEASON_WEEKS } from "./ruleset";

/**
 * Period boundaries of the Builder League, in the fixed zone Asia/Ho_Chi_Minh (UTC+7, no DST).
 * Timestamps are stored as UTC epoch ms; only these helpers turn them into local periods.
 *
 * - week: ISO week, Monday 00:00 → Sunday 23:59:59.999 local, key `2026-W42` (ISO week-year);
 * - month: calendar month, key `2026-10`;
 * - year: calendar year, key `2026`;
 * - season: 8 ISO weeks from `SEASON_EPOCH` (Monday 2026-10-19), key `S<start year>-<number>` where the
 *   number counts seasons from 1 (`S2026-1`, `S2026-2`, `S2027-3`, …). Everything before the epoch is
 *   season `S0`.
 *
 * `periodRange` returns an inclusive range: `end` is the last millisecond of the period.
 */
export const BUILDER_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SEASON_MS = SEASON_WEEKS * WEEK_MS;
const SEASON_EPOCH_MS = Date.parse(SEASON_EPOCH);

export interface PeriodRange {
  start: Date;
  /** Inclusive: the last millisecond of the period. */
  end: Date;
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** Wall-clock fields of `at` in UTC+7, read with the getUTC* accessors. */
function toLocal(at: Date | number): Date {
  return new Date((typeof at === "number" ? at : at.getTime()) + UTC_OFFSET_MS);
}

/** UTC instant of local midnight on the given local calendar date (month is 0-based, may overflow). */
function localMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) - UTC_OFFSET_MS;
}

/** Monday 00:00 local of ISO week 1 of `isoYear`, as a local-wall-clock epoch (not shifted to UTC). */
function isoWeekOneMondayLocal(isoYear: number): number {
  const jan4 = Date.UTC(isoYear, 0, 4);
  const weekday = (new Date(jan4).getUTCDay() + 6) % 7;
  return jan4 - weekday * DAY_MS;
}

function isoWeek(at: Date): { isoYear: number; week: number } {
  const local = toLocal(at);
  const weekday = (local.getUTCDay() + 6) % 7;
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - weekday);
  const isoYear = new Date(monday + 3 * DAY_MS).getUTCFullYear();
  const week = Math.floor((monday - isoWeekOneMondayLocal(isoYear)) / WEEK_MS) + 1;
  return { isoYear, week };
}

/** Local calendar date `YYYY-MM-DD` of `at`. */
export function localDateKey(at: Date): string {
  const local = toLocal(at);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** Local calendar year of `at`. */
export function localYear(at: Date): number {
  return toLocal(at).getUTCFullYear();
}

export function periodKey(type: PeriodType, at: Date): string {
  const local = toLocal(at);
  switch (type) {
    case "week": {
      const { isoYear, week } = isoWeek(at);
      return `${isoYear}-W${pad(week)}`;
    }
    case "month":
      return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}`;
    case "year":
      return String(local.getUTCFullYear());
    case "season": {
      const index = Math.floor((at.getTime() - SEASON_EPOCH_MS) / SEASON_MS);
      if (index < 0) return "S0";
      return `S${localYear(new Date(SEASON_EPOCH_MS + index * SEASON_MS))}-${index + 1}`;
    }
  }
}

function invalidKey(type: PeriodType, key: string): never {
  throw new RangeError(`Invalid ${type} period key: ${key}`);
}

export function periodRange(type: PeriodType, key: string): PeriodRange {
  let start: number;
  let next: number;
  switch (type) {
    case "week": {
      const match = /^(\d{4})-W(\d{2})$/.exec(key);
      if (!match) invalidKey(type, key);
      start = isoWeekOneMondayLocal(Number(match[1])) + (Number(match[2]) - 1) * WEEK_MS - UTC_OFFSET_MS;
      next = start + WEEK_MS;
      break;
    }
    case "month": {
      const match = /^(\d{4})-(\d{2})$/.exec(key);
      if (!match) invalidKey(type, key);
      start = localMidnight(Number(match[1]), Number(match[2]) - 1, 1);
      next = localMidnight(Number(match[1]), Number(match[2]), 1);
      break;
    }
    case "year": {
      if (!/^\d{4}$/.test(key)) invalidKey(type, key);
      start = localMidnight(Number(key), 0, 1);
      next = localMidnight(Number(key) + 1, 0, 1);
      break;
    }
    case "season": {
      if (key === "S0") return { start: new Date(0), end: new Date(SEASON_EPOCH_MS - 1) };
      const match = /^S(\d{4})-(\d+)$/.exec(key);
      if (!match || Number(match[2]) < 1) invalidKey(type, key);
      start = SEASON_EPOCH_MS + (Number(match[2]) - 1) * SEASON_MS;
      next = start + SEASON_MS;
      break;
    }
  }
  // Reject keys that do not round-trip (W54, month 13, a season number under the wrong year).
  if (periodKey(type, new Date(start)) !== key) invalidKey(type, key);
  return { start: new Date(start), end: new Date(next - 1) };
}

export function previousPeriodKey(type: PeriodType, key: string): string {
  if (type === "season" && key === "S0") throw new RangeError("Season S0 has no previous season.");
  return periodKey(type, new Date(periodRange(type, key).start.getTime() - 1));
}

export function nextPeriodKey(type: PeriodType, key: string): string {
  return periodKey(type, new Date(periodRange(type, key).end.getTime() + 1));
}

export function isInPeriod(type: PeriodType, key: string, at: Date): boolean {
  const { start, end } = periodRange(type, key);
  return at.getTime() >= start.getTime() && at.getTime() <= end.getTime();
}
