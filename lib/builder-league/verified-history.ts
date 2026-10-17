/**
 * Verified history of a member: the activity events that still stand and meet the verification level
 * their event type requires under the ruleset they were recorded with. Badges, missions and reward
 * eligibility all read this one projection, so "verified" means the same thing everywhere.
 *
 * An event stops counting once a later `reversal` or `correction` event supersedes it. Self-reported
 * activity, unknown event types and non-activity kinds (rank, badge, adjustment) never count.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { builderEvents } from "@/lib/db/schema";
import { getRuleset, meetsVerification } from "./ruleset";
import { isEventTypeKey, type EventTypeKey, type Stage, type Verification } from "./types";

export interface VerifiedEvent {
  /** `builder_events.id`, the id stored as evidence on badge awards. */
  id: string;
  eventType: EventTypeKey;
  stage: Stage;
  projectId: string | null;
  occurredAt: Date;
  verification: Verification;
  counterpartyUserId: string | null;
}

const COUNTING_KINDS = ["activity", "backfill", "correction"] as const;

/** Every standing verified activity event of `userId`, oldest first. */
export async function getVerifiedHistory(db: AppDb, userId: string): Promise<VerifiedEvent[]> {
  const [rows, superseding] = await Promise.all([
    db
      .select()
      .from(builderEvents)
      .where(and(eq(builderEvents.subjectUserId, userId), inArray(builderEvents.kind, [...COUNTING_KINDS]))),
    db
      .select({ supersedes: builderEvents.supersedesEventId })
      .from(builderEvents)
      .where(
        and(
          eq(builderEvents.subjectUserId, userId),
          inArray(builderEvents.kind, ["reversal", "correction"]),
          isNotNull(builderEvents.supersedesEventId)
        )
      ),
  ]);
  const superseded = new Set(superseding.map((row) => row.supersedes));
  const verified: VerifiedEvent[] = [];
  for (const row of rows) {
    if (superseded.has(row.id) || superseded.has(row.eventId)) continue;
    if (!isEventTypeKey(row.eventType)) continue;
    const definition = getRuleset(row.rulesetVersion).events[row.eventType];
    if (!definition || !meetsVerification(row.verification, definition.requiredVerification)) continue;
    const counterparty = row.payload?.counterpartyUserId;
    verified.push({
      id: row.id,
      eventType: row.eventType,
      stage: row.stage,
      projectId: row.projectId,
      occurredAt: row.occurredAt,
      verification: row.verification,
      counterpartyUserId: typeof counterparty === "string" && counterparty !== userId ? counterparty : null,
    });
  }
  return verified.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));
}
