/**
 * Fixtures shared by the rankings and passport tests. Ledger rows are inserted directly: boards, ranks
 * and passports only read `score_ledger` / `builder_events`, and the award path itself is covered by
 * the ledger tests.
 */
import type { AppDb } from "@/lib/db";
import { builderEvents, builderPrivacy, scoreLedger, users } from "@/lib/db/schema";
import type { BuilderEventKind, Stage, Verification, Visibility } from "@/lib/builder-league/types";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Local (UTC+7) wall clock to a UTC Date: `local(2026, 9, 28, 10)` = 2026-09-28 10:00 in Saigon. */
export const local = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour - 7, minute));

export async function addUsers(db: AppDb, ids: string[], overrides: Partial<typeof users.$inferInsert> = {}) {
  await db.insert(users).values(ids.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.com`, ...overrides })));
}

export async function optIn(db: AppDb, userId: string, values: Partial<typeof builderPrivacy.$inferInsert> = { leaderboardPublic: true }) {
  await db.insert(builderPrivacy).values({ userId, ...values }).onConflictDoUpdate({ target: builderPrivacy.userId, set: values });
}

let sequence = 0;

export interface LedgerFixture {
  stage: Stage;
  rp: number;
  at: Date;
  awardType?: string;
  reversesEntryId?: string | null;
  eventId?: string;
  id?: string;
}

/** Inserts one ledger row (and a minimal backing event unless `eventId` is given). Returns its id. */
export async function addLedger(db: AppDb, userId: string, entry: LedgerFixture): Promise<string> {
  const n = ++sequence;
  const id = entry.id ?? `entry-${n}`;
  const awardType = entry.awardType ?? `${entry.stage === "validate" ? "validate_problem_signal" : entry.stage === "build" ? "build_scope_cut" : entry.stage === "ship" ? "ship_public_post" : "contribute_contributor_work"}`;
  let eventId = entry.eventId;
  if (!eventId) {
    eventId = await addEvent(db, userId, { stage: entry.stage, eventType: awardType, at: entry.at });
  }
  await db.insert(scoreLedger).values({
    id,
    userId,
    eventId,
    awardType,
    stage: entry.stage,
    rp: entry.rp,
    rulesetVersion: "v2",
    dedupeKey: `dedupe-${n}-${id}`,
    reversesEntryId: entry.reversesEntryId ?? null,
    reason: "fixture",
    occurredAt: entry.at,
    createdAt: entry.at,
  });
  return id;
}

export interface EventFixture {
  stage: Stage;
  eventType: string;
  at: Date;
  kind?: BuilderEventKind;
  visibility?: Visibility;
  verification?: Verification;
  evidenceId?: string | null;
  projectId?: string | null;
  payload?: Record<string, unknown>;
}

export async function addEvent(db: AppDb, userId: string, event: EventFixture): Promise<string> {
  const n = ++sequence;
  const id = `event-${n}`;
  await db.insert(builderEvents).values({
    id,
    eventId: `public-${id}`,
    kind: event.kind ?? "activity",
    subjectUserId: userId,
    actorUserId: "mod",
    actorRole: "moderator",
    projectId: event.projectId ?? null,
    stage: event.stage,
    eventType: event.eventType,
    source: "moderator",
    externalEventId: `fixture-${n}`,
    dedupeKey: `event-dedupe-${n}`,
    occurredAt: event.at,
    receivedAt: event.at,
    rulesetVersion: "v2",
    verification: event.verification ?? "moderator_verified",
    visibility: event.visibility ?? "private",
    evidenceId: event.evidenceId ?? null,
    payload: event.payload ?? {},
  });
  return id;
}

/** A reversal row for `entryId` (negative RP, same occurred_at). */
export async function reverse(db: AppDb, userId: string, entryId: string, original: LedgerFixture) {
  return addLedger(db, userId, { ...original, rp: -original.rp, reversesEntryId: entryId, id: undefined, eventId: undefined });
}
