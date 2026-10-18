/**
 * Builder League tracking dashboard (admin only, `app/[locale]/studio/builder-league/metrics`).
 *
 * Every number is a SQL aggregate over the builder tables; nothing is estimated or padded. Each metric
 * carries its numerator, denominator and the window it was computed over, and small counts are returned
 * as they are (the dashboard is admin-only, so no small-cohort suppression applies here).
 *
 * Shared definitions:
 * - Active member: on the pilot allowlist or enrolled in a season, with at least one evidence
 *   submission. First activity = the member's first submission (`activity_evidence.created_at`).
 * - Verified event: a `builder_events` row of kind `activity` or `backfill` with peer, moderator or
 *   system verification whose award was not reversed (no `reversal` event supersedes it).
 * - Progress event: a verified event of the VALIDATE, BUILD or SHIP stage.
 * - Time basis: league metrics use the moment an event was verified (`received_at`) and count kind
 *   `activity` only, so an imported record never reads as progress made in the league. The pilot
 *   comparison uses `occurred_at` and includes imported records, because the period before enrollment
 *   has no other history; the share of imported events is reported next to it.
 * - Windows are local dates in Asia/Ho_Chi_Minh, inclusive on both ends.
 */
import { and, gte, lte, sql, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { rewardClaims, rewardItems } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { STAGES, type Stage } from "./types";
import { UTC_OFFSET_MS, localDateKey, periodKey, periodRange } from "./time-windows";

const DAY_MS = 86_400_000;

/** North star: verified progress within this many days of first activity. */
export const NORTH_STAR_HORIZON_DAYS = 90;
export const DEFAULT_WINDOW_DAYS = 90;
export const MAX_WINDOW_DAYS = 731;
/** Newcomer: first activity at most this many days before the window end. */
export const NEWCOMER_DAYS = 90;
/** Stage specialist: at least this share of the member's RP in the window comes from one stage. */
export const SPECIALIST_SHARE = 0.6;
/** Pilot evaluation: weeks compared before and after enrollment. */
export const PILOT_COMPARISON_WEEKS = 8;
/** Most recent weeks and months listed by the activity-rate table. */
export const MAX_ACTIVITY_PERIODS = 12;
/** Months after the cohort month followed by the retention table (M+1 … M+3). */
export const RETENTION_OFFSETS = [1, 2, 3] as const;

export const PROBLEM_SIGNAL_TYPES = ["validate_problem_signal"] as const;
export const CUSTOMER_OR_PAYMENT_TYPES = ["build_first_real_user", "ship_first_payment"] as const;

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export interface Ratio {
  numerator: number;
  denominator: number;
  /** numerator / denominator, or null when the denominator is 0. */
  rate: number | null;
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null };
}

/** Linear-interpolated quantile (type 7) of the values; null for an empty list. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export const median = (values: readonly number[]) => quantile(values, 0.5);

export interface MetricsWindow {
  /** First instant of `fromKey` (local midnight). */
  start: Date;
  /** Last millisecond of `toKey` (local). */
  end: Date;
  fromKey: string;
  toKey: string;
  days: number;
}

export interface TimeSpan {
  start: string;
  end: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function localDayStart(key: string): number | null {
  if (!DATE_KEY.test(key)) return null;
  const start = Date.parse(`${key}T00:00:00Z`) - UTC_OFFSET_MS;
  return Number.isFinite(start) && localDateKey(new Date(start)) === key ? start : null;
}

/**
 * Validates `from` / `to` (`YYYY-MM-DD`, local). Defaults to the last `DEFAULT_WINDOW_DAYS` days ending
 * today. Throws a 400 for malformed dates, a reversed or future range, or more than `MAX_WINDOW_DAYS`.
 */
export function parseMetricsWindow(input: { from?: string | null; to?: string | null }, now = new Date()): MetricsWindow {
  const todayKey = localDateKey(now);
  const toKey = input.to?.trim() || todayKey;
  const toStart = localDayStart(toKey);
  if (toStart === null) throw new BuilderApiError(400, "invalid_window", "`to` must be a date (YYYY-MM-DD).");
  const fromKey = input.from?.trim() || localDateKey(new Date(toStart - (DEFAULT_WINDOW_DAYS - 1) * DAY_MS));
  const fromStart = localDayStart(fromKey);
  if (fromStart === null) throw new BuilderApiError(400, "invalid_window", "`from` must be a date (YYYY-MM-DD).");
  if (toStart > localDayStart(todayKey)!) throw new BuilderApiError(400, "invalid_window", "The window cannot end in the future.");
  if (fromStart > toStart) throw new BuilderApiError(400, "invalid_window", "`from` must not be after `to`.");
  const days = Math.round((toStart - fromStart) / DAY_MS) + 1;
  if (days > MAX_WINDOW_DAYS) throw new BuilderApiError(400, "invalid_window", `The window is limited to ${MAX_WINDOW_DAYS} days.`);
  return { start: new Date(fromStart), end: new Date(toStart + DAY_MS - 1), fromKey, toKey, days };
}

const span = (start: Date | number, end: Date | number): TimeSpan => ({
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
});

// ---------------------------------------------------------------------------
// Shared SQL
// ---------------------------------------------------------------------------

/** Pilot members and season entrants. */
const ENROLLED = sql`enrolled as (select user_id from builder_pilot_members union select user_id from season_enrollments)`;
/** Enrolled members with at least one submission and their first activity. */
const ACTIVE = sql`active as (
  select e.user_id as user_id, min(e.created_at) as first_at
  from activity_evidence e
  where e.user_id in (select user_id from enrolled)
  group by e.user_id
)`;
/** Verified, unreversed events (see the module comment). */
const VERIFIED = sql`verified as (
  select ev.id as id, ev.subject_user_id as user_id, ev.kind as kind, ev.stage as stage, ev.event_type as event_type,
         ev.occurred_at as occurred_at, ev.received_at as received_at
  from builder_events ev
  where ev.kind in ('activity', 'backfill')
    and ev.verification in ('peer_confirmed', 'moderator_verified', 'system_verified')
    and not exists (select 1 from builder_events r where r.kind = 'reversal' and r.supersedes_event_id = ev.id)
)`;
const WITH_ALL = sql`with ${ENROLLED}, ${ACTIVE}, ${VERIFIED}`;

/** Local calendar month of an epoch-ms column as `year * 12 + month - 1`. */
function monthIndex(column: SQL): SQL {
  const seconds = sql`(${column} + ${UTC_OFFSET_MS}) / 1000`;
  return sql`(cast(strftime('%Y', ${seconds}, 'unixepoch') as integer) * 12 + cast(strftime('%m', ${seconds}, 'unixepoch') as integer) - 1)`;
}

const monthKeyOf = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
const num = (value: unknown) => Number(value ?? 0);
const inList = (values: readonly string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `);

// ---------------------------------------------------------------------------
// North star and time to first signal
// ---------------------------------------------------------------------------

export interface NorthStarMetric {
  horizonDays: number;
  /** Members whose first activity falls in the window. */
  cohort: number;
  /** Cohort members whose horizon has not elapsed yet (excluded from the rate). */
  pending: number;
  /** Members who reached verified progress within the horizon / members whose horizon elapsed. */
  reached: Ratio;
  /** Pending members who already reached it (reported, not in the rate). */
  reachedPending: number;
  cohortWindow: TimeSpan;
}

async function northStar(db: AppDb, window: MetricsWindow, now: Date): Promise<NorthStarMetric> {
  const horizon = NORTH_STAR_HORIZON_DAYS * DAY_MS;
  const reachedExpr = sql`exists (
    select 1 from verified v
    where v.user_id = c.user_id and v.kind = 'activity' and v.stage <> 'contribute'
      and v.received_at >= c.first_at and v.received_at < c.first_at + ${horizon}
  )`;
  const [row] = await db.all<{ cohort: number; mature: number; reached: number; reached_pending: number }>(sql`
    ${WITH_ALL},
    cohort as (select user_id, first_at from active where first_at between ${window.start.getTime()} and ${window.end.getTime()})
    select count(*) as cohort,
      coalesce(sum(case when c.first_at + ${horizon} <= ${now.getTime()} then 1 else 0 end), 0) as mature,
      coalesce(sum(case when c.first_at + ${horizon} <= ${now.getTime()} and ${reachedExpr} then 1 else 0 end), 0) as reached,
      coalesce(sum(case when c.first_at + ${horizon} > ${now.getTime()} and ${reachedExpr} then 1 else 0 end), 0) as reached_pending
    from cohort c
  `);
  const cohort = num(row?.cohort);
  const mature = num(row?.mature);
  return {
    horizonDays: NORTH_STAR_HORIZON_DAYS,
    cohort,
    pending: cohort - mature,
    reached: ratio(num(row?.reached), mature),
    reachedPending: num(row?.reached_pending),
    cohortWindow: span(window.start, window.end),
  };
}

export type FirstSignalKey = "problem_signal" | "customer_or_payment";

export interface TimeToFirstMetric {
  key: FirstSignalKey;
  eventTypes: readonly string[];
  /** Cohort members with a verified event of these types / cohort size. */
  reached: Ratio;
  /** Days from first activity to verification, over the members who reached it. */
  medianDays: number | null;
  minDays: number | null;
  maxDays: number | null;
}

async function timeToFirst(db: AppDb, window: MetricsWindow, key: FirstSignalKey, eventTypes: readonly string[]): Promise<TimeToFirstMetric> {
  const rows = await db.all<{ user_id: string; first_at: number; reached_at: number | null }>(sql`
    ${WITH_ALL}
    select a.user_id as user_id, a.first_at as first_at,
      (select min(v.received_at) from verified v
        where v.user_id = a.user_id and v.kind = 'activity' and v.event_type in (${inList(eventTypes)})) as reached_at
    from active a
    where a.first_at between ${window.start.getTime()} and ${window.end.getTime()}
  `);
  const days = rows
    .filter((row) => row.reached_at !== null)
    .map((row) => Math.max(0, (num(row.reached_at) - num(row.first_at)) / DAY_MS));
  return {
    key,
    eventTypes,
    reached: ratio(days.length, rows.length),
    medianDays: median(days),
    minDays: days.length ? Math.min(...days) : null,
    maxDays: days.length ? Math.max(...days) : null,
  };
}

// ---------------------------------------------------------------------------
// Meaningful activity
// ---------------------------------------------------------------------------

export interface ActivityPeriod {
  periodType: "week" | "month";
  key: string;
  range: TimeSpan;
  /** Members with at least one verified event that period / active members by the period end. */
  active: Ratio;
}

/** The most recent `MAX_ACTIVITY_PERIODS` weeks or months overlapping the window, oldest first. */
export function activityPeriods(periodType: "week" | "month", window: MetricsWindow, now: Date): { key: string; start: number; end: number }[] {
  const periods: { key: string; start: number; end: number }[] = [];
  const last = Math.min(window.end.getTime(), now.getTime());
  let key = periodKey(periodType, new Date(last));
  for (let i = 0; i < MAX_ACTIVITY_PERIODS; i++) {
    const range = periodRange(periodType, key);
    if (range.end.getTime() < window.start.getTime()) break;
    periods.unshift({ key, start: range.start.getTime(), end: range.end.getTime() });
    key = periodKey(periodType, new Date(range.start.getTime() - 1));
  }
  return periods;
}

async function activityRates(db: AppDb, periodType: "week" | "month", window: MetricsWindow, now: Date): Promise<ActivityPeriod[]> {
  const periods = activityPeriods(periodType, window, now);
  if (periods.length === 0) return [];
  const values = sql.join(periods.map((p) => sql`(${p.key}, ${p.start}, ${p.end})`), sql`, `);
  const rows = await db.all<{ key: string; denominator: number; numerator: number }>(sql`
    ${WITH_ALL},
    periods(key, s, e) as (values ${values})
    select p.key as key,
      (select count(*) from active a where a.first_at <= p.e) as denominator,
      (select count(distinct v.user_id) from verified v join active a on a.user_id = v.user_id
        where v.kind = 'activity' and v.received_at between p.s and p.e and a.first_at <= p.e) as numerator
    from periods p
  `);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return periods.map((p) => {
    const row = byKey.get(p.key);
    return { periodType, key: p.key, range: span(p.start, p.end), active: ratio(num(row?.numerator), num(row?.denominator)) };
  });
}

// ---------------------------------------------------------------------------
// Peer help
// ---------------------------------------------------------------------------

export interface PeerHelpMetric {
  /** Peer-help submissions created in the window. */
  submitted: number;
  confirmed: number;
  approved: number;
  /** Confirmed by the person helped and approved / submitted. */
  confirmedApproved: Ratio;
  rejected: number;
  open: number;
  withdrawn: number;
  helpers: number;
  helped: number;
  /** Pairs who confirmed help for each other in the window (anti-gaming signal). */
  reciprocalPairs: number;
}

async function peerHelp(db: AppDb, window: MetricsWindow): Promise<PeerHelpMetric> {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const [row] = await db.all<Record<string, number>>(sql`
    select count(*) as submitted,
      coalesce(sum(case when counterparty_confirmed_at is not null then 1 else 0 end), 0) as confirmed,
      coalesce(sum(case when status = 'approved' then 1 else 0 end), 0) as approved,
      coalesce(sum(case when status = 'approved' and counterparty_confirmed_at is not null then 1 else 0 end), 0) as confirmed_approved,
      coalesce(sum(case when status = 'rejected' then 1 else 0 end), 0) as rejected,
      coalesce(sum(case when status in ('submitted', 'needs_info') then 1 else 0 end), 0) as open,
      coalesce(sum(case when status = 'withdrawn' then 1 else 0 end), 0) as withdrawn,
      count(distinct user_id) as helpers,
      count(distinct counterparty_user_id) as helped
    from activity_evidence
    where event_type = 'contribute_peer_help' and created_at between ${start} and ${end}
  `);
  const [pairs] = await db.all<{ pairs: number }>(sql`
    with ph as (
      select distinct user_id as a, counterparty_user_id as b from activity_evidence
      where event_type = 'contribute_peer_help' and counterparty_confirmed_at is not null
        and counterparty_user_id is not null and created_at between ${start} and ${end}
    )
    select count(*) as pairs from ph p1 join ph p2 on p1.a = p2.b and p1.b = p2.a where p1.a < p1.b
  `);
  const submitted = num(row?.submitted);
  return {
    submitted,
    confirmed: num(row?.confirmed),
    approved: num(row?.approved),
    confirmedApproved: ratio(num(row?.confirmed_approved), submitted),
    rejected: num(row?.rejected),
    open: num(row?.open),
    withdrawn: num(row?.withdrawn),
    helpers: num(row?.helpers),
    helped: num(row?.helped),
    reciprocalPairs: num(pairs?.pairs),
  };
}

// ---------------------------------------------------------------------------
// Participation and retention by cohort
// ---------------------------------------------------------------------------

export interface RetentionCohort {
  /** First-activity month, `YYYY-MM`. */
  cohort: string;
  size: number;
  /** One cell per `RETENTION_OFFSETS`; null while that month has not started. */
  months: ({ offset: number; month: string; active: Ratio } | null)[];
}

async function retention(db: AppDb, window: MetricsWindow, now: Date): Promise<RetentionCohort[]> {
  const cohortCte = sql`cohort as (
    select user_id, ${monthIndex(sql`first_at`)} as m0 from active
    where first_at between ${window.start.getTime()} and ${window.end.getTime()}
  )`;
  const [sizes, cells] = await Promise.all([
    db.all<{ m0: number; size: number }>(sql`
      with ${ENROLLED}, ${ACTIVE}, ${cohortCte}
      select m0, count(*) as size from cohort group by m0 order by m0
    `),
    db.all<{ m0: number; k: number; n: number }>(sql`
      with ${ENROLLED}, ${ACTIVE}, ${cohortCte},
      acts as (
        select distinct e.user_id as user_id, ${monthIndex(sql`e.created_at`)} as m
        from activity_evidence e join cohort c on c.user_id = e.user_id
      )
      select c.m0 as m0, a.m - c.m0 as k, count(distinct a.user_id) as n
      from cohort c join acts a on a.user_id = c.user_id
      where a.m - c.m0 between 1 and ${RETENTION_OFFSETS[RETENTION_OFFSETS.length - 1]}
      group by c.m0, a.m - c.m0
    `),
  ]);
  const currentMonth = num(periodKey("month", now).slice(0, 4)) * 12 + num(periodKey("month", now).slice(5)) - 1;
  const counts = new Map(cells.map((cell) => [`${num(cell.m0)}:${num(cell.k)}`, num(cell.n)]));
  return sizes.map((row) => {
    const m0 = num(row.m0);
    const size = num(row.size);
    return {
      cohort: monthKeyOf(m0),
      size,
      months: RETENTION_OFFSETS.map((offset) =>
        m0 + offset > currentMonth ? null : { offset, month: monthKeyOf(m0 + offset), active: ratio(counts.get(`${m0}:${offset}`) ?? 0, size) }
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export const CLAIM_STATUSES = ["requested", "approved", "rejected", "redeemed", "expired", "cancelled"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface RewardMetricRow {
  rewardId: string;
  key: string;
  title: { en: string; vi: string };
  active: boolean;
  /** Units left now; null for unlimited. */
  remaining: number | null;
  /** Remaining + held (requested, approved) + redeemed, all time; null for unlimited. */
  capacity: number | null;
  /** Claims created in the window, by status. */
  claims: Record<ClaimStatus, number>;
  /** Redeemed / claims created in the window. */
  redeemed: Ratio;
  heldAllTime: number;
  redeemedAllTime: number;
}

export interface RewardMetrics {
  items: RewardMetricRow[];
  claims: number;
  redeemed: Ratio;
  /** Redeemed all time / total capacity of limited items. */
  capacityUsed: Ratio;
}

const emptyClaims = (): Record<ClaimStatus, number> => Object.fromEntries(CLAIM_STATUSES.map((s) => [s, 0])) as Record<ClaimStatus, number>;

async function rewards(db: AppDb, window: MetricsWindow): Promise<RewardMetrics> {
  const [items, windowRows, allRows] = await Promise.all([
    db.select().from(rewardItems).orderBy(rewardItems.createdAt),
    db
      .select({ rewardId: rewardClaims.rewardId, status: rewardClaims.status, count: sql<number>`count(*)` })
      .from(rewardClaims)
      .where(and(gte(rewardClaims.createdAt, window.start), lte(rewardClaims.createdAt, window.end)))
      .groupBy(rewardClaims.rewardId, rewardClaims.status),
    db
      .select({ rewardId: rewardClaims.rewardId, status: rewardClaims.status, count: sql<number>`count(*)` })
      .from(rewardClaims)
      .groupBy(rewardClaims.rewardId, rewardClaims.status),
  ]);
  const rows = items.map((item): RewardMetricRow => {
    const claims = emptyClaims();
    for (const row of windowRows) if (row.rewardId === item.id) claims[row.status] = num(row.count);
    const all = emptyClaims();
    for (const row of allRows) if (row.rewardId === item.id) all[row.status] = num(row.count);
    const heldAllTime = all.requested + all.approved;
    const total = CLAIM_STATUSES.reduce((sum, status) => sum + claims[status], 0);
    return {
      rewardId: item.id,
      key: item.key,
      title: item.title,
      active: item.active,
      remaining: item.inventory,
      capacity: item.inventory === null ? null : item.inventory + heldAllTime + all.redeemed,
      claims,
      redeemed: ratio(claims.redeemed, total),
      heldAllTime,
      redeemedAllTime: all.redeemed,
    };
  });
  const claimTotal = rows.reduce((sum, row) => sum + row.redeemed.denominator, 0);
  const limited = rows.filter((row) => row.capacity !== null);
  return {
    items: rows,
    claims: claimTotal,
    redeemed: ratio(rows.reduce((sum, row) => sum + row.redeemed.numerator, 0), claimTotal),
    capacityUsed: ratio(
      limited.reduce((sum, row) => sum + row.redeemedAllTime, 0),
      limited.reduce((sum, row) => sum + (row.capacity ?? 0), 0)
    ),
  };
}

// ---------------------------------------------------------------------------
// Integrity: rejections, reversals, appeals
// ---------------------------------------------------------------------------

export interface IntegrityMetrics {
  /** Evidence decided in the window: rejected / (approved + rejected). */
  rejection: Ratio;
  approved: number;
  rejected: number;
  /** Reason codes on rejections recorded in the window, most frequent first. */
  reasonCodes: { code: string; count: number }[];
  /** Reversal ledger entries created in the window / award entries created in the window. */
  reversals: Ratio;
  reversedRp: number;
  appeals: { opened: number; open: number; upheld: number; overturned: number; withdrawn: number };
}

async function integrity(db: AppDb, window: MetricsWindow): Promise<IntegrityMetrics> {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const [[decisions], codes, [ledger], [appeals]] = await Promise.all([
    db.all<{ approved: number; rejected: number }>(sql`
      select coalesce(sum(case when status = 'approved' then 1 else 0 end), 0) as approved,
        coalesce(sum(case when status = 'rejected' then 1 else 0 end), 0) as rejected
      from activity_evidence where decided_at between ${start} and ${end}
    `),
    db.all<{ code: string; count: number }>(sql`
      select j.value as code, count(*) as count
      from builder_moderation_actions a, json_each(a.reason_codes) j
      where a.target_type = 'evidence' and a.action = 'reject' and a.created_at between ${start} and ${end}
      group by j.value order by count desc, code
    `),
    db.all<{ awards: number; reversals: number; reversed_rp: number }>(sql`
      select coalesce(sum(case when reverses_entry_id is null and rp > 0 then 1 else 0 end), 0) as awards,
        coalesce(sum(case when reverses_entry_id is not null then 1 else 0 end), 0) as reversals,
        coalesce(sum(case when reverses_entry_id is not null then -rp else 0 end), 0) as reversed_rp
      from score_ledger where created_at between ${start} and ${end}
    `),
    db.all<Record<string, number>>(sql`
      select count(*) as opened,
        coalesce(sum(case when status = 'open' then 1 else 0 end), 0) as open,
        coalesce(sum(case when status = 'upheld' then 1 else 0 end), 0) as upheld,
        coalesce(sum(case when status = 'overturned' then 1 else 0 end), 0) as overturned,
        coalesce(sum(case when status = 'withdrawn' then 1 else 0 end), 0) as withdrawn
      from evidence_appeals where created_at between ${start} and ${end}
    `),
  ]);
  const approved = num(decisions?.approved);
  const rejected = num(decisions?.rejected);
  return {
    rejection: ratio(rejected, approved + rejected),
    approved,
    rejected,
    reasonCodes: codes.map((row) => ({ code: String(row.code), count: num(row.count) })),
    reversals: ratio(num(ledger?.reversals), num(ledger?.awards)),
    reversedRp: num(ledger?.reversed_rp),
    appeals: {
      opened: num(appeals?.opened),
      open: num(appeals?.open),
      upheld: num(appeals?.upheld),
      overturned: num(appeals?.overturned),
      withdrawn: num(appeals?.withdrawn),
    },
  };
}

// ---------------------------------------------------------------------------
// Wrapped funnel
// ---------------------------------------------------------------------------

export interface WrappedFunnel {
  /** Members with a Year in Review snapshot created in the window. */
  completed: number;
  /** Of those, members who created a Year in Review share link in the window. */
  shared: Ratio;
  /** Visits recorded on Year in Review links in the window. */
  visits: number;
  /** Members who signed up through a link in the window / visits. */
  signups: Ratio;
  /** Members attributed a paid membership in the window / signups in the window. */
  paid: Ratio;
}

async function wrappedFunnel(db: AppDb, window: MetricsWindow): Promise<WrappedFunnel> {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const [row] = await db.all<Record<string, number>>(sql`
    with completed as (
      select distinct user_id from yearly_snapshots where created_at between ${start} and ${end}
    ),
    sharers as (
      select distinct user_id from builder_share_links
      where kind = 'year_review' and created_at between ${start} and ${end}
    ),
    attributions as (
      select sa.kind as kind, sa.user_id as user_id from share_attributions sa
      join builder_share_links l on l.id = sa.share_link_id
      where l.kind = 'year_review' and sa.created_at between ${start} and ${end}
    )
    select (select count(*) from completed) as completed,
      (select count(*) from completed c where c.user_id in (select user_id from sharers)) as shared,
      (select count(*) from attributions where kind = 'visit') as visits,
      (select count(distinct user_id) from attributions where kind = 'signup') as signups,
      (select count(distinct user_id) from attributions where kind = 'paid') as paid
  `);
  const completed = num(row?.completed);
  const visits = num(row?.visits);
  const signups = num(row?.signups);
  return {
    completed,
    shared: ratio(num(row?.shared), completed),
    visits,
    signups: ratio(signups, visits),
    paid: ratio(num(row?.paid), signups),
  };
}

// ---------------------------------------------------------------------------
// Fairness: RP distribution across cohorts
// ---------------------------------------------------------------------------

export type DistributionCohortKey = "all" | "newcomers" | "established" | `specialist_${Stage}` | "contributors";

export interface DistributionCohort {
  key: DistributionCohortKey;
  members: number;
  /** Members with positive net RP in the window / members. */
  scored: Ratio;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
}

interface MemberRp {
  userId: string;
  firstAt: number;
  total: number;
  stages: Record<Stage, number>;
}

/** Splits members into the fairness cohorts and summarises their net RP in the window. */
export function distributionCohorts(members: readonly MemberRp[], windowEnd: number): DistributionCohort[] {
  const summarise = (key: DistributionCohortKey, list: readonly MemberRp[]): DistributionCohort => {
    const totals = list.map((member) => member.total);
    return {
      key,
      members: list.length,
      scored: ratio(list.filter((member) => member.total > 0).length, list.length),
      p25: quantile(totals, 0.25),
      median: quantile(totals, 0.5),
      p75: quantile(totals, 0.75),
      max: totals.length ? Math.max(...totals) : null,
    };
  };
  const newcomerSince = windowEnd - NEWCOMER_DAYS * DAY_MS;
  const cohorts: DistributionCohort[] = [
    summarise("all", members),
    summarise("newcomers", members.filter((member) => member.firstAt >= newcomerSince)),
    summarise("established", members.filter((member) => member.firstAt < newcomerSince)),
  ];
  for (const stage of STAGES) {
    cohorts.push(
      summarise(
        `specialist_${stage}`,
        members.filter((member) => member.total > 0 && member.stages[stage] >= SPECIALIST_SHARE * member.total)
      )
    );
  }
  cohorts.push(summarise("contributors", members.filter((member) => member.stages.contribute > 0)));
  return cohorts;
}

async function distribution(db: AppDb, window: MetricsWindow): Promise<DistributionCohort[]> {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const [population, sums] = await Promise.all([
    db.all<{ user_id: string; first_at: number }>(sql`
      with ${ENROLLED}, ${ACTIVE}
      select user_id, first_at from active where first_at <= ${end}
    `),
    db.all<{ user_id: string; stage: Stage; rp: number }>(sql`
      with ${ENROLLED}, ${ACTIVE}
      select l.user_id as user_id, l.stage as stage, sum(l.rp) as rp
      from score_ledger l join active a on a.user_id = l.user_id
      where l.occurred_at between ${start} and ${end} and a.first_at <= ${end}
      group by l.user_id, l.stage
    `),
  ]);
  const members = new Map<string, MemberRp>(
    population.map((row) => [
      row.user_id,
      { userId: row.user_id, firstAt: num(row.first_at), total: 0, stages: { validate: 0, build: 0, ship: 0, contribute: 0 } },
    ])
  );
  for (const row of sums) {
    const member = members.get(row.user_id);
    if (!member || !(STAGES as readonly string[]).includes(row.stage)) continue;
    member.stages[row.stage] += num(row.rp);
    member.total += num(row.rp);
  }
  return distributionCohorts([...members.values()], end);
}

// ---------------------------------------------------------------------------
// Pilot evaluation: before vs after enrollment
// ---------------------------------------------------------------------------

export interface PilotSide {
  /** Members with at least one verified event in this window / members evaluated. */
  withEvent: Ratio;
  events: number;
  /** Of `events`, how many are imported (backfill) records. */
  importedEvents: number;
  meanPerMember: number | null;
  medianPerMember: number | null;
}

export interface PilotEvaluation {
  weeks: number;
  /** Members whose enrollment (first of pilot add or season join) falls in the window. */
  enrolled: number;
  /** Enrolled members whose post window has not ended yet (excluded). */
  pending: number;
  evaluated: number;
  before: PilotSide;
  after: PilotSide;
  improved: Ratio;
  unchanged: Ratio;
  declined: Ratio;
  enrollmentWindow: TimeSpan;
}

function pilotSide(counts: readonly { events: number; imported: number }[]): PilotSide {
  const events = counts.reduce((sum, row) => sum + row.events, 0);
  return {
    withEvent: ratio(counts.filter((row) => row.events > 0).length, counts.length),
    events,
    importedEvents: counts.reduce((sum, row) => sum + row.imported, 0),
    meanPerMember: counts.length ? events / counts.length : null,
    medianPerMember: median(counts.map((row) => row.events)),
  };
}

async function pilotEvaluation(db: AppDb, window: MetricsWindow, now: Date): Promise<PilotEvaluation> {
  const span8 = PILOT_COMPARISON_WEEKS * 7 * DAY_MS;
  const count = (from: SQL, to: SQL, importedOnly: boolean) => sql`(
    select count(*) from verified v where v.user_id = en.user_id
      and v.occurred_at >= ${from} and v.occurred_at < ${to}${importedOnly ? sql` and v.kind = 'backfill'` : sql``}
  )`;
  const before = [sql`en.enrolled_at - ${span8}`, sql`en.enrolled_at`] as const;
  const after = [sql`en.enrolled_at`, sql`en.enrolled_at + ${span8}`] as const;
  const rows = await db.all<{ user_id: string; enrolled_at: number; pre: number; pre_imported: number; post: number; post_imported: number }>(sql`
    with ${VERIFIED},
    enrollment as (
      select user_id, min(at) as enrolled_at from (
        select user_id, added_at as at from builder_pilot_members
        union all select user_id, joined_at as at from season_enrollments
      ) group by user_id
    )
    select en.user_id as user_id, en.enrolled_at as enrolled_at,
      ${count(...before, false)} as pre, ${count(...before, true)} as pre_imported,
      ${count(...after, false)} as post, ${count(...after, true)} as post_imported
    from enrollment en
    where en.enrolled_at between ${window.start.getTime()} and ${window.end.getTime()}
  `);
  const evaluated = rows.filter((row) => num(row.enrolled_at) + span8 <= now.getTime());
  const pre = evaluated.map((row) => ({ events: num(row.pre), imported: num(row.pre_imported) }));
  const post = evaluated.map((row) => ({ events: num(row.post), imported: num(row.post_imported) }));
  const delta = evaluated.map((row) => num(row.post) - num(row.pre));
  return {
    weeks: PILOT_COMPARISON_WEEKS,
    enrolled: rows.length,
    pending: rows.length - evaluated.length,
    evaluated: evaluated.length,
    before: pilotSide(pre),
    after: pilotSide(post),
    improved: ratio(delta.filter((d) => d > 0).length, evaluated.length),
    unchanged: ratio(delta.filter((d) => d === 0).length, evaluated.length),
    declined: ratio(delta.filter((d) => d < 0).length, evaluated.length),
    enrollmentWindow: span(window.start, window.end),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface BuilderMetrics {
  generatedAt: string;
  window: { fromKey: string; toKey: string; days: number } & TimeSpan;
  /** Active members (pilot or season, at least one submission) whose first activity is on or before the window end. */
  activeMembers: number;
  northStar: NorthStarMetric;
  timeToFirst: TimeToFirstMetric[];
  activity: { weeks: ActivityPeriod[]; months: ActivityPeriod[] };
  peerHelp: PeerHelpMetric;
  retention: RetentionCohort[];
  rewards: RewardMetrics;
  integrity: IntegrityMetrics;
  wrapped: WrappedFunnel;
  distribution: DistributionCohort[];
  pilot: PilotEvaluation;
}

/** Computes every dashboard metric for one window. Read-only. */
export async function getBuilderMetrics(db: AppDb, window: MetricsWindow, now = new Date()): Promise<BuilderMetrics> {
  const [activeRow] = await db.all<{ count: number }>(sql`
    with ${ENROLLED}, ${ACTIVE} select count(*) as count from active where first_at <= ${window.end.getTime()}
  `);
  const [star, problem, customer, weeks, months, help, cohorts, rewardMetrics, integrityMetrics, wrapped, fairness, pilot] = await Promise.all([
    northStar(db, window, now),
    timeToFirst(db, window, "problem_signal", PROBLEM_SIGNAL_TYPES),
    timeToFirst(db, window, "customer_or_payment", CUSTOMER_OR_PAYMENT_TYPES),
    activityRates(db, "week", window, now),
    activityRates(db, "month", window, now),
    peerHelp(db, window),
    retention(db, window, now),
    rewards(db, window),
    integrity(db, window),
    wrappedFunnel(db, window),
    distribution(db, window),
    pilotEvaluation(db, window, now),
  ]);
  return {
    generatedAt: now.toISOString(),
    window: { fromKey: window.fromKey, toKey: window.toKey, days: window.days, ...span(window.start, window.end) },
    activeMembers: num(activeRow?.count),
    northStar: star,
    timeToFirst: [problem, customer],
    activity: { weeks, months },
    peerHelp: help,
    retention: cohorts,
    rewards: rewardMetrics,
    integrity: integrityMetrics,
    wrapped,
    distribution: fairness,
    pilot,
  };
}
