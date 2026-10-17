/**
 * Kill Board: recognised Idea Slayer learnings, i.e. moderator-approved stop/pivot decisions that the
 * member chose to share.
 *
 * Consent and redaction:
 * - Only approved `validate_stop_pivot` evidence whose own visibility is `community` or `public` appears;
 *   private evidence never does. Evidence whose event was later reversed is dropped.
 * - The author's name is shown only when they made their passport public; otherwise "anonymous".
 * - Links, private files, counterparties and e-mail addresses are never included. Money amounts are
 *   redacted unless the member turned financial redaction off.
 */
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { activityEvidence, badgeAwards, builderEvents, builderPrivacy, builderProjects, users } from "@/lib/db/schema";
import type { Visibility } from "./types";

export interface KillBoardEntry {
  evidenceId: string;
  title: string;
  learning: string;
  occurredAt: string;
  visibility: Exclude<Visibility, "private">;
  author: { userId: string; name: string } | null;
  projectName: string | null;
  ideaSlayer: boolean;
}

const MONEY = /(?:[$€£₫]\s?\d[\d.,\s]*(?:k|m|tr|triệu|nghìn)?|\d[\d.,]*\s?(?:k|m|tr|triệu|nghìn)?\s?(?:usd|vnd|vnđ|đồng|dollars?|eur|₫|đ)\b)/giu;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** Removes contact details always and money amounts when `redactFinancials` is on. */
export function redactLearning(text: string, redactFinancials: boolean): string {
  let out = text.replace(EMAIL, "[email]").replace(URL_PATTERN, "[link]");
  if (redactFinancials) out = out.replace(MONEY, "[amount]");
  return out.trim();
}

export async function getKillBoard(db: AppDb, { limit = 50 }: { limit?: number } = {}): Promise<KillBoardEntry[]> {
  const rows = await db
    .select({
      evidence: activityEvidence,
      name: users.name,
      passportPublic: builderPrivacy.passportPublic,
      redactFinancials: builderPrivacy.redactFinancials,
      projectName: builderProjects.name,
      projectVisibility: builderProjects.visibility,
    })
    .from(activityEvidence)
    .innerJoin(users, eq(users.id, activityEvidence.userId))
    .leftJoin(builderPrivacy, eq(builderPrivacy.userId, activityEvidence.userId))
    .leftJoin(builderProjects, eq(builderProjects.id, activityEvidence.projectId))
    .where(
      and(
        eq(activityEvidence.eventType, "validate_stop_pivot"),
        eq(activityEvidence.status, "approved"),
        inArray(activityEvidence.visibility, ["community", "public"])
      )
    )
    .orderBy(desc(activityEvidence.occurredAt), desc(activityEvidence.id))
    .limit(Math.min(Math.max(limit, 1), 200));
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((row) => row.evidence.userId))];
  const eventIds = rows.map((row) => row.evidence.eventId).filter((id): id is string => Boolean(id));
  const [reversed, slayers] = await Promise.all([
    eventIds.length
      ? db
          .select({ supersedes: builderEvents.supersedesEventId })
          .from(builderEvents)
          .where(and(inArray(builderEvents.kind, ["reversal", "correction"]), inArray(builderEvents.supersedesEventId, eventIds), isNotNull(builderEvents.supersedesEventId)))
      : Promise.resolve([]),
    db
      .select({ userId: badgeAwards.userId })
      .from(badgeAwards)
      .where(
        and(
          inArray(badgeAwards.userId, userIds),
          eq(badgeAwards.badgeKey, "idea_slayer"),
          eq(badgeAwards.seasonKey, ""),
          isNull(badgeAwards.revokedAt)
        )
      ),
  ]);
  const reversedIds = new Set(reversed.map((row) => row.supersedes));
  const slayerIds = new Set(slayers.map((row) => row.userId));

  return rows
    .filter((row) => !row.evidence.eventId || !reversedIds.has(row.evidence.eventId))
    .map((row) => {
      const redactFinancials = row.redactFinancials ?? true;
      return {
        evidenceId: row.evidence.id,
        title: redactLearning(row.evidence.title, redactFinancials),
        learning: redactLearning(row.evidence.summary, redactFinancials),
        occurredAt: row.evidence.occurredAt.toISOString(),
        visibility: row.evidence.visibility as Exclude<Visibility, "private">,
        author: row.passportPublic ? { userId: row.evidence.userId, name: row.name } : null,
        projectName: row.projectName && row.projectVisibility !== "private" ? row.projectName : null,
        ideaSlayer: slayerIds.has(row.evidence.userId),
      };
    });
}
