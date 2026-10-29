import { LIVE_TIMEZONE } from "./types";
import { liveInvalid } from "./live-errors";

/**
 * Wall-clock helpers for operator input. Rounds and events are configured in `Asia/Ho_Chi_Minh`
 * and stored as UTC epoch ms; conversion goes through `Intl`, so it stays correct for any IANA zone
 * (including zones with DST) rather than hard-coding +07:00.
 */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

function parseLocal(date: string, time: string): { y: number; m: number; d: number; h: number; mi: number } {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) throw liveInvalid("Local date must be YYYY-MM-DD and time HH:mm");
  const [y, m, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw liveInvalid(`Invalid calendar date ${date}`);
  }
  return { y, m, d, h: Number(tm[1]), mi: Number(tm[2]) };
}

/** Convert a local wall-clock date/time in `timeZone` to the UTC instant it denotes. */
export function zonedLocalToUtc(date: string, time: string, timeZone: string = LIVE_TIMEZONE): Date {
  const { y, m, d, h, mi } = parseLocal(date, time);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let utc = wall - zoneOffsetMs(wall, timeZone);
  // A second pass settles instants next to an offset change.
  utc = wall - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

/** Add whole calendar days to a `YYYY-MM-DD` date string. */
export function addLocalDays(date: string, days: number): string {
  const { y, m, d } = parseLocal(date, "00:00");
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface WeeklyWindowInput {
  /** Local opening date, `YYYY-MM-DD`. */
  opensOn: string;
  /** Local opening time, `HH:mm` (24h). */
  opensAt: string;
  /** Local closing time on the last day, `HH:mm`; defaults to the opening time. */
  closesAt?: string;
  /** Length of the window in calendar days (default 7). */
  days?: number;
  timeZone?: string;
}

/**
 * Build a voting window such as "Monday 09:00 → next Monday 09:00, Asia/Ho_Chi_Minh". The closing
 * instant is computed from the local calendar date, so a week is always 7 local days.
 */
export function buildWeeklyWindow(input: WeeklyWindowInput): { opensAt: Date; closesAt: Date; timezone: string } {
  const timeZone = input.timeZone ?? LIVE_TIMEZONE;
  const days = input.days ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > 31) throw liveInvalid("days must be an integer between 1 and 31");
  const opensAt = zonedLocalToUtc(input.opensOn, input.opensAt, timeZone);
  const closesAt = zonedLocalToUtc(addLocalDays(input.opensOn, days), input.closesAt ?? input.opensAt, timeZone);
  if (closesAt.getTime() <= opensAt.getTime()) throw liveInvalid("The window must close after it opens");
  return { opensAt, closesAt, timezone: timeZone };
}
