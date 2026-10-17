import { recordBuilderEvent, type RecordBuilderEventInput } from "@/lib/builder-league/ledger";
import { builderProjects, users } from "@/lib/db/schema";
import type { AppDb } from "@/lib/db";
import type { EventTypeKey } from "@/lib/builder-league/types";

/** Monday 2026-10-19 00:00 local, the first day of season S2026-1. */
export const SEASON_ONE_START = new Date("2026-10-18T17:00:00Z");
export const DAY = 24 * 60 * 60 * 1000;
export const at = (days: number, from: Date = SEASON_ONE_START) => new Date(from.getTime() + days * DAY);

export async function seedMembers(db: AppDb, ids: string[] = ["u1", "u2", "u3", "u4", "admin"]): Promise<void> {
  await db.insert(users).values(
    ids.map((id) => ({ id, name: `Member ${id}`, email: `${id}@example.com`, role: id === "admin" ? "admin" : "user" }))
  );
  await db.insert(builderProjects).values(
    ids.filter((id) => id !== "admin").map((id) => ({ id: `p-${id}`, ownerUserId: id, name: `Project ${id}`, slug: `project-${id}` }))
  );
}

let counter = 0;

/** Records a moderator-verified event (or the given verification) for `userId`. */
export async function verified(
  db: AppDb,
  userId: string,
  eventType: EventTypeKey,
  occurredAt: Date,
  overrides: Partial<RecordBuilderEventInput> = {}
) {
  counter += 1;
  const { event } = await recordBuilderEvent(db, {
    subjectUserId: userId,
    actorUserId: "admin",
    actorRole: "moderator",
    projectId: eventType.startsWith("contribute") ? null : `p-${userId}`,
    eventType,
    source: "moderator",
    externalEventId: `fixture-${counter}`,
    occurredAt,
    rulesetVersion: "v2",
    verification: "moderator_verified",
    ...overrides,
  });
  return event;
}
