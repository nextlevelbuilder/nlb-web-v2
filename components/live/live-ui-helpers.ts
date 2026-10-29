/**
 * Pure helpers for the NLB Live pages: date/price formatting in the event's IANA zone, the hero CTA
 * state machine, topic grouping and API error mapping. No React, no I/O, so they are unit-testable
 * and safe to share between server and client components.
 */
import type { LiveEventStatus, LiveTicketStatus } from "@/lib/live/types";
import { LIVE_TIMEZONE } from "@/lib/live/types";
import type { LiveUiErrorCode } from "@/lib/live/live-copy";

/** Chapter plate for the Live pages (and their social cards): numeral XI, the Pleiades. */
export const LIVE_PLATE_NUMERAL = "XI";
export const LIVE_PLATE_COORD = "M45 · RA 03h 47m · Dec +24° 07′";

const intlLocale = (locale: string) => (locale === "vi" ? "vi-VN" : "en-GB");

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return LIVE_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return LIVE_TIMEZONE;
  }
}

/** "GMT+7" style offset of `timeZone` at `date`. */
export function zoneOffsetLabel(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: safeZone(timeZone), timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "GMT";
}

export interface LiveDateTimeParts {
  /** e.g. "Thursday 6 November 2026" / "Thứ Năm, 6 tháng 11, 2026" */
  date: string;
  /** 24h wall-clock time, e.g. "20:00" */
  time: string;
  /** e.g. "GMT+7 · Asia/Ho_Chi_Minh" */
  zone: string;
  /** Machine-readable instant for `<time dateTime>` */
  iso: string;
}

/** Wall-clock parts of `date` in `timeZone` (default Asia/Ho_Chi_Minh), with the zone spelled out. */
export function formatLiveDateTime(date: Date, locale: string, timeZone: string = LIVE_TIMEZONE): LiveDateTimeParts {
  const zone = safeZone(timeZone);
  const day = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return { date: day, time, zone: `${zoneOffsetLabel(date, zone)} · ${zone}`, iso: date.toISOString() };
}

/** Localized event title / description. */
export function liveEventTitle(event: { titleEn: string; titleVi: string }, locale: string): string {
  return locale === "vi" ? event.titleVi : event.titleEn;
}

export function liveEventDescription(event: { descriptionEn: string; descriptionVi: string }, locale: string): string {
  return locale === "vi" ? event.descriptionVi : event.descriptionEn;
}

/** One-line form: "Thursday 6 November 2026, 20:00 (GMT+7 · Asia/Ho_Chi_Minh)". */
export function formatLiveDateTimeLine(date: Date, locale: string, timeZone: string = LIVE_TIMEZONE): string {
  const parts = formatLiveDateTime(date, locale, timeZone);
  return `${parts.date}, ${parts.time} (${parts.zone})`;
}

/** Short time with zone, e.g. "19:45 GMT+7". */
export function formatLiveTime(date: Date, timeZone: string = LIVE_TIMEZONE): string {
  const zone = safeZone(timeZone);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${time} ${zoneOffsetLabel(date, zone)}`;
}

/** Integer minor units for display ("$19.00", "19,00 US$"); zero is the localized "Free". */
export function formatLivePrice(priceCents: number, currency: string, locale: string, freeLabel: string): string {
  if (priceCents <= 0) return freeLabel;
  try {
    return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { style: "currency", currency: currency.toUpperCase() }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Days/hours/minutes until `target` (floored, never negative). */
export function timeLeftParts(target: Date, now: Date): { days: number; hours: number; minutes: number; totalMs: number } {
  const totalMs = Math.max(0, target.getTime() - now.getTime());
  const minutesTotal = Math.floor(totalMs / 60_000);
  return { days: Math.floor(minutesTotal / 1440), hours: Math.floor((minutesTotal % 1440) / 60), minutes: minutesTotal % 60, totalMs };
}

/** Seat meter (DESIGN.md): "N of M left" only once at least half the seats are taken. */
export function seatMeter(seatsLeft: number | null, capacity: number): { kind: "left"; left: number } | { kind: "limited" } | { kind: "sold_out" } | null {
  if (seatsLeft === null) return null;
  if (seatsLeft <= 0) return { kind: "sold_out" };
  return capacity - seatsLeft >= capacity / 2 ? { kind: "left", left: seatsLeft } : { kind: "limited" };
}

export interface LiveViewer {
  id: string;
  emailVerified: boolean;
}

export interface LiveTicketSummary {
  ticketStatus: LiveTicketStatus | null;
  holdExpiresAt: Date | null;
}

export type LiveEventCta =
  | { kind: "cancelled" }
  | { kind: "ended" }
  | { kind: "ticketed" }
  | { kind: "ticket_exception" }
  | { kind: "sales_not_open" }
  | { kind: "sales_closed" }
  | { kind: "sold_out" }
  | { kind: "sign_in" }
  | { kind: "verify_email" }
  | { kind: "buy"; heldUntil: Date | null };

/**
 * Hero call to action for one event. Order matters: terminal states first, then an existing ticket
 * (which outranks sales state, so a holder always sees the join path), then sales gating, then the
 * viewer's own eligibility. An active hold counts as a seat for the viewer even when the event shows
 * zero seats left.
 */
export function selectEventCta(input: {
  status: LiveEventStatus;
  endsAt: Date;
  seatsLeft: number | null;
  viewer: LiveViewer | null;
  ticket: LiveTicketSummary | null;
  now: Date;
}): LiveEventCta {
  const { status, endsAt, seatsLeft, viewer, ticket, now } = input;
  if (status === "cancelled") return { kind: "cancelled" };
  if (status === "ended" || status === "archived" || status === "draft" || now.getTime() >= endsAt.getTime()) return { kind: "ended" };
  if (ticket?.ticketStatus === "active") return { kind: "ticketed" };
  if (ticket?.ticketStatus === "exception") return { kind: "ticket_exception" };
  if (status === "scheduled") return { kind: "sales_not_open" };
  if (status === "live") return { kind: "sales_closed" };
  const heldUntil = ticket?.holdExpiresAt && ticket.holdExpiresAt.getTime() > now.getTime() ? ticket.holdExpiresAt : null;
  if (!heldUntil && (seatsLeft ?? 0) <= 0) return { kind: "sold_out" };
  if (!viewer) return { kind: "sign_in" };
  if (!viewer.emailVerified) return { kind: "verify_email" };
  return { kind: "buy", heldUntil };
}

export interface TopicGroupInfo {
  id: string;
  title: string;
  sortOrder: number;
}

export interface GroupedTopics<T> {
  group: TopicGroupInfo | null;
  topics: T[];
}

/**
 * Group a round's topics (already in round order) by their topic group, groups ordered by sortOrder
 * then first appearance; topics with an unknown group go last under `group: null`.
 */
export function groupRoundTopics<T extends { id: string }>(topics: readonly T[], groupOf: ReadonlyMap<string, TopicGroupInfo>): GroupedTopics<T>[] {
  const buckets = new Map<string, GroupedTopics<T> & { first: number }>();
  const ungrouped: T[] = [];
  topics.forEach((topic, index) => {
    const group = groupOf.get(topic.id);
    if (!group) {
      ungrouped.push(topic);
      return;
    }
    const bucket = buckets.get(group.id) ?? { group, topics: [], first: index };
    bucket.topics.push(topic);
    buckets.set(group.id, bucket);
  });
  const ordered = [...buckets.values()].sort((a, b) => (a.group!.sortOrder - b.group!.sortOrder) || (a.first - b.first));
  const result: GroupedTopics<T>[] = ordered.map(({ group, topics: list }) => ({ group, topics: list }));
  if (ungrouped.length) result.push({ group: null, topics: ungrouped });
  return result;
}

const KNOWN_CODES: ReadonlySet<LiveUiErrorCode> = new Set<LiveUiErrorCode>([
  "unauthenticated", "email_unverified", "banned", "forbidden", "rate_limited", "round_not_open", "topic_not_in_round",
  "not_found", "sold_out", "sales_not_open", "already_ticketed", "recording_consent_required", "checkout_failed",
]);

/**
 * Map a member-API failure (`{ error: { code } }` envelope plus HTTP status) to a copy key. A known
 * code wins; otherwise the status decides; anything else is "unknown".
 */
export function liveErrorCode(status: number, body: unknown): LiveUiErrorCode {
  const raw = (body as { error?: { code?: unknown } } | null)?.error?.code;
  const code = typeof raw === "string" ? raw : null;
  if (code === "round_closed" || code === "round_not_open") return "round_not_open";
  if (code && KNOWN_CODES.has(code as LiveUiErrorCode)) return code as LiveUiErrorCode;
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unknown";
}

/** Event slugs follow the domain slug rule (lowercase, digits, single dashes, max 120). */
export function isLiveSlug(value: string): boolean {
  return value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
