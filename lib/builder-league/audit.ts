import type { AppDb } from "@/lib/db";
import { builderModerationActions } from "@/lib/db/schema";
import type { ActorRole } from "./types";

export type ModerationAction = typeof builderModerationActions.$inferSelect;

export interface ModerationActionInput {
  /** e.g. `evidence`, `ledger_entry`, `appeal`, `pilot_member`, `reward_claim`, `rank`. */
  targetType: string;
  targetId: string;
  /** e.g. `approve`, `reject`, `request_info`, `reverse`, `add`, `remove`. */
  action: string;
  actorId: string;
  actorRole: ActorRole;
  reasonCodes?: string[];
  notes?: string | null;
}

/** Builds the insert without running it, so callers can put it in the same `db.batch` as the change. */
export function moderationActionInsert(db: AppDb, input: ModerationActionInput) {
  return db.insert(builderModerationActions).values({
    id: crypto.randomUUID(),
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    actorId: input.actorId,
    actorRole: input.actorRole,
    reasonCodes: input.reasonCodes ?? [],
    notes: input.notes ?? null,
    createdAt: new Date(),
  });
}

/** Appends one row to the moderator audit trail. Audit rows are never edited or deleted. */
export async function recordModerationAction(db: AppDb, input: ModerationActionInput): Promise<ModerationAction> {
  const [row] = await moderationActionInsert(db, input).returning();
  return row;
}
