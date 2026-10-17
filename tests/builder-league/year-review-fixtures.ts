import type { AppDb } from "@/lib/db";
import { builderEvents, scoreLedger } from "@/lib/db/schema";
import type { BuilderEventKind, EventSource, Stage, Verification, Visibility } from "@/lib/builder-league/types";

const HOUR = 3_600_000;

/** UTC instant of a wall-clock time in Asia/Ho_Chi_Minh (UTC+7). */
export function local(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}

export interface EventSeed {
  id: string;
  subjectUserId?: string;
  eventType: string;
  stage: Stage;
  occurredAt: Date;
  receivedAt?: Date;
  kind?: BuilderEventKind;
  source?: EventSource;
  verification?: Verification;
  visibility?: Visibility;
  projectId?: string | null;
  evidenceId?: string | null;
  supersedesEventId?: string | null;
  payload?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  rp?: number;
}

/** Inserts an event row directly (full control over timestamps) and, when `rp` is set, its ledger row. */
export async function seedEvent(db: AppDb, seed: EventSeed): Promise<void> {
  const subject = seed.subjectUserId ?? "u1";
  await db.insert(builderEvents).values({
    id: seed.id,
    eventId: `evt-${seed.id}`,
    kind: seed.kind ?? "activity",
    subjectUserId: subject,
    actorUserId: "mod",
    actorRole: "moderator",
    projectId: seed.projectId ?? null,
    stage: seed.stage,
    eventType: seed.eventType,
    source: seed.source ?? "moderator",
    externalEventId: seed.id,
    dedupeKey: `dedupe-${seed.id}`,
    occurredAt: seed.occurredAt,
    receivedAt: seed.receivedAt ?? new Date(seed.occurredAt.getTime() + HOUR),
    rulesetVersion: "v2",
    verification: seed.verification ?? "moderator_verified",
    visibility: seed.visibility ?? "private",
    evidenceId: seed.evidenceId ?? null,
    supersedesEventId: seed.supersedesEventId ?? null,
    payload: seed.payload ?? {},
    provenance: seed.provenance ?? {},
  });
  if (seed.rp) {
    await db.insert(scoreLedger).values({
      userId: subject,
      eventId: seed.id,
      awardType: seed.eventType,
      stage: seed.stage,
      rp: seed.rp,
      rulesetVersion: "v2",
      dedupeKey: `ledger-${seed.id}`,
      occurredAt: seed.occurredAt,
      createdAt: seed.receivedAt ?? new Date(seed.occurredAt.getTime() + HOUR),
    });
  }
}
