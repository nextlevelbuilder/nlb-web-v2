/**
 * Community Wrapped: the public, aggregate year of the NLB community, stored in
 * `community_wrapped_snapshots`.
 *
 * Every figure is auditable: it names its source table, event types, verification levels, timeframe
 * and denominator. Only verified, non-superseded events count. A metric whose cohort (distinct members
 * behind it) is smaller than `MIN_COHORT` is suppressed rather than shown, so no individual can be
 * singled out. No member is named. The same provisional/final cutoffs as the Year in Review apply.
 */
import { desc, eq } from "drizzle-orm";
import { createHash } from "crypto";
import type { AppDb } from "@/lib/db";
import { communityWrappedSnapshots } from "@/lib/db/schema";
import { canonicalJson } from "./ruleset";
import { BUILDER_TIME_ZONE } from "./time-windows";
import { readVerifiedMilestoneEvents, snapshotCutoff, yearWindow, type SnapshotStatus } from "./year-review";
import type { Verification } from "./types";

export const COMMUNITY_WRAPPED_SCHEMA = 1;
/** Cohorts smaller than this are suppressed. */
export const MIN_COHORT = 5;

export type CommunityMetricKey = "active_builders" | "active_validators" | "launches" | "paying_products" | "peer_help";

export interface CommunityMetric {
  key: CommunityMetricKey;
  /** The headline count; null when suppressed. */
  value: number | null;
  unit: "members" | "launches" | "projects" | "outcomes";
  /** Distinct members behind the value; null when suppressed. */
  members: number | null;
  /** The population the share is taken from; null for the base metric or when suppressed. */
  denominator: { key: "active_builders"; value: number } | null;
  /** Extra audited counts (e.g. distinct members helped). */
  extra: Record<string, number>;
  suppressed: boolean;
  source: "builder_events";
  eventTypes: string[];
  verification: Verification[];
}

export interface CommunityWrappedData {
  schema: number;
  year: number;
  status: SnapshotStatus;
  timeframe: { start: number; end: number; cutoffAt: number; timeZone: string };
  minCohort: number;
  metrics: CommunityMetric[];
  /** Backfilled events counted, so imported history is disclosed. */
  backfilledEvents: number;
  eventHash: string;
}

const MEMBER_VERIFIED: Verification[] = ["peer_confirmed", "moderator_verified", "system_verified"];
const STRICT_VERIFIED: Verification[] = ["moderator_verified", "system_verified"];

export interface CommunityEvent {
  id: string;
  subjectUserId: string;
  projectId: string | null;
  stage: string;
  eventType: string;
  verification: Verification;
  backfill: boolean;
  counterpartyUserId: string | null;
}

function metric(
  key: CommunityMetricKey,
  unit: CommunityMetric["unit"],
  rows: CommunityEvent[],
  value: (rows: CommunityEvent[]) => number,
  meta: { eventTypes: string[]; verification: Verification[]; denominator: number | null; extra?: (rows: CommunityEvent[]) => Record<string, number> }
): CommunityMetric {
  const members = new Set(rows.map((r) => r.subjectUserId)).size;
  const denominatorSuppressed = meta.denominator !== null && meta.denominator < MIN_COHORT;
  const suppressed = members < MIN_COHORT || denominatorSuppressed;
  return {
    key,
    value: suppressed ? null : value(rows),
    unit,
    members: suppressed ? null : members,
    denominator: suppressed || meta.denominator === null ? null : { key: "active_builders", value: meta.denominator },
    extra: suppressed || !meta.extra ? {} : meta.extra(rows),
    suppressed,
    source: "builder_events",
    eventTypes: meta.eventTypes,
    verification: meta.verification,
  };
}

/** Pure aggregation; exported for tests. */
export function buildCommunityWrappedData(input: { year: number; status: SnapshotStatus; cutoffAt: number; events: CommunityEvent[] }): CommunityWrappedData {
  const window = yearWindow(input.year);
  const events = [...input.events].sort((a, b) => (a.id < b.id ? -1 : 1));
  const verified = events.filter((e) => MEMBER_VERIFIED.includes(e.verification));
  const activeBuilders = new Set(verified.map((e) => e.subjectUserId)).size;
  const denominator = activeBuilders;

  const validators = verified.filter((e) => e.stage === "validate");
  const launches = events.filter((e) => e.eventType === "ship_product_launch" && STRICT_VERIFIED.includes(e.verification));
  const payments = events.filter((e) => e.eventType === "ship_first_payment" && STRICT_VERIFIED.includes(e.verification));
  const peerHelp = verified.filter((e) => e.eventType === "contribute_peer_help");

  const metrics: CommunityMetric[] = [
    metric("active_builders", "members", verified, (rows) => new Set(rows.map((r) => r.subjectUserId)).size, {
      eventTypes: ["*"], verification: MEMBER_VERIFIED, denominator: null,
    }),
    metric("active_validators", "members", validators, (rows) => new Set(rows.map((r) => r.subjectUserId)).size, {
      eventTypes: ["validate_*"], verification: MEMBER_VERIFIED, denominator,
    }),
    metric("launches", "launches", launches, (rows) => new Set(rows.map((r) => r.projectId ?? `event:${r.id}`)).size, {
      eventTypes: ["ship_product_launch"], verification: STRICT_VERIFIED, denominator,
    }),
    metric("paying_products", "projects", payments, (rows) => new Set(rows.map((r) => r.projectId ?? `event:${r.id}`)).size, {
      eventTypes: ["ship_first_payment"], verification: STRICT_VERIFIED, denominator,
    }),
    metric("peer_help", "outcomes", peerHelp, (rows) => rows.length, {
      eventTypes: ["contribute_peer_help"], verification: MEMBER_VERIFIED, denominator,
      extra: (rows): Record<string, number> => {
        const helped = new Set(rows.map((r) => r.counterpartyUserId).filter((id): id is string => Boolean(id))).size;
        return helped >= MIN_COHORT ? { membersHelped: helped } : {};
      },
    }),
  ];

  return {
    schema: COMMUNITY_WRAPPED_SCHEMA,
    year: input.year,
    status: input.status,
    timeframe: { start: window.start, end: window.end, cutoffAt: input.cutoffAt, timeZone: BUILDER_TIME_ZONE },
    minCohort: MIN_COHORT,
    metrics,
    backfilledEvents: verified.filter((e) => e.backfill).length,
    eventHash: createHash("sha256").update(events.map((e) => e.id).join("|")).digest("hex"),
  };
}

export async function computeCommunityWrapped(db: AppDb, year: number, now: Date): Promise<CommunityWrappedData> {
  const window = yearWindow(year);
  const { status, cutoffAt, occurredUntil, readUntil } = snapshotCutoff(year, now);
  const rows = await readVerifiedMilestoneEvents(db, { occurredFrom: window.start, occurredUntil, readUntil });
  return buildCommunityWrappedData({
    year,
    status,
    cutoffAt,
    events: rows.map((row) => ({
      id: row.id,
      subjectUserId: row.subjectUserId,
      projectId: row.projectId,
      stage: row.stage,
      eventType: row.eventType,
      verification: row.verification,
      backfill: row.kind === "backfill" || row.source === "backfill",
      counterpartyUserId: typeof row.payload?.counterpartyUserId === "string" ? row.payload.counterpartyUserId : null,
    })),
  });
}

export type CommunityWrappedSnapshot = typeof communityWrappedSnapshots.$inferSelect;

export async function getLatestCommunityWrapped(db: AppDb, year: number): Promise<CommunityWrappedSnapshot | null> {
  const [row] = await db
    .select()
    .from(communityWrappedSnapshots)
    .where(eq(communityWrappedSnapshots.year, year))
    .orderBy(desc(communityWrappedSnapshots.version))
    .limit(1);
  return row ?? null;
}

/** Stores a new version only when the aggregate changed; a final snapshot is never replaced. */
export async function ensureCommunityWrapped(db: AppDb, year: number, now: Date): Promise<{ snapshot: CommunityWrappedSnapshot; created: boolean }> {
  const latest = await getLatestCommunityWrapped(db, year);
  if (latest?.status === "final") return { snapshot: latest, created: false };
  const data = await computeCommunityWrapped(db, year, now);
  if (latest && canonicalJson(latest.data) === canonicalJson(data)) return { snapshot: latest, created: false };
  const [inserted] = await db
    .insert(communityWrappedSnapshots)
    .values({ year, version: (latest?.version ?? 0) + 1, status: data.status, data: data as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { snapshot: inserted, created: true };
  const concurrent = await getLatestCommunityWrapped(db, year);
  if (!concurrent) throw new Error("community wrapped insert conflicted but no row was found");
  return { snapshot: concurrent, created: false };
}

export function communityWrappedData(row: CommunityWrappedSnapshot): CommunityWrappedData {
  return row.data as unknown as CommunityWrappedData;
}
