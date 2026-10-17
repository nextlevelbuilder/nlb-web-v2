/**
 * Ship Relay data: peer help recorded as activity evidence with a counterparty (piece B's evidence form).
 *
 * - "Awaiting": help someone logged for the viewer that the viewer has not confirmed yet.
 * - "Given": help the viewer logged, with confirmation and review status.
 * - Feed: approved, counterparty-confirmed help shared with the community. Names appear only when both
 *   builders allow peer mentions; otherwise the feed says "a builder".
 */
import { aliasedTable, and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { activityEvidence, builderPrivacy, users } from "@/lib/db/schema";
import type { EvidenceStatus } from "@/lib/builder-league/types";

/** Evidence types that carry a counterparty who confirms the help. */
export const RELAY_EVENT_TYPES = ["contribute_peer_help", "contribute_weekly_feedback"] as const;

export interface RelayItem {
  evidenceId: string;
  title: string;
  occurredAt: string;
  status: EvidenceStatus;
  confirmed: boolean;
  otherName: string;
}

export interface RelayFeedItem {
  evidenceId: string;
  title: string;
  occurredAt: string;
  helperName: string | null;
  helpedName: string | null;
}

export interface RelayOverview {
  awaiting: RelayItem[];
  given: RelayItem[];
  feed: RelayFeedItem[];
  totals: { confirmed: number; builders: number };
}

const relayTypes = inArray(activityEvidence.eventType, [...RELAY_EVENT_TYPES]);

export async function getRelayOverview(db: AppDb, viewerId: string, { limit = 20 } = {}): Promise<RelayOverview> {
  const helper = aliasedTable(users, "relay_helper");
  const helped = aliasedTable(users, "relay_helped");
  const helperPrivacy = aliasedTable(builderPrivacy, "relay_helper_privacy");
  const helpedPrivacy = aliasedTable(builderPrivacy, "relay_helped_privacy");

  const [awaitingRows, givenRows, feedRows, confirmedRows] = await Promise.all([
    db
      .select({ evidence: activityEvidence, otherName: helper.name })
      .from(activityEvidence)
      .innerJoin(helper, eq(helper.id, activityEvidence.userId))
      .where(
        and(
          relayTypes,
          eq(activityEvidence.counterpartyUserId, viewerId),
          isNull(activityEvidence.counterpartyConfirmedAt),
          inArray(activityEvidence.status, ["submitted", "needs_info"])
        )
      )
      .orderBy(desc(activityEvidence.occurredAt))
      .limit(limit),
    db
      .select({ evidence: activityEvidence, otherName: helped.name })
      .from(activityEvidence)
      .innerJoin(helped, eq(helped.id, activityEvidence.counterpartyUserId))
      .where(and(relayTypes, eq(activityEvidence.userId, viewerId)))
      .orderBy(desc(activityEvidence.occurredAt))
      .limit(limit),
    db
      .select({
        evidence: activityEvidence,
        helperName: helper.name,
        helpedName: helped.name,
        helperOk: helperPrivacy.peerMentionsOk,
        helpedOk: helpedPrivacy.peerMentionsOk,
      })
      .from(activityEvidence)
      .innerJoin(helper, eq(helper.id, activityEvidence.userId))
      .innerJoin(helped, eq(helped.id, activityEvidence.counterpartyUserId))
      .leftJoin(helperPrivacy, eq(helperPrivacy.userId, activityEvidence.userId))
      .leftJoin(helpedPrivacy, eq(helpedPrivacy.userId, activityEvidence.counterpartyUserId))
      .where(
        and(
          relayTypes,
          eq(activityEvidence.status, "approved"),
          isNotNull(activityEvidence.counterpartyConfirmedAt),
          inArray(activityEvidence.visibility, ["community", "public"])
        )
      )
      .orderBy(desc(activityEvidence.occurredAt))
      .limit(limit),
    db
      .select({ helperId: activityEvidence.userId, helpedId: activityEvidence.counterpartyUserId })
      .from(activityEvidence)
      .where(and(relayTypes, eq(activityEvidence.status, "approved"), isNotNull(activityEvidence.counterpartyConfirmedAt))),
  ]);

  const toItem = (row: { evidence: typeof activityEvidence.$inferSelect; otherName: string }): RelayItem => ({
    evidenceId: row.evidence.id,
    title: row.evidence.title,
    occurredAt: row.evidence.occurredAt.toISOString(),
    status: row.evidence.status,
    confirmed: Boolean(row.evidence.counterpartyConfirmedAt),
    otherName: row.otherName,
  });
  const builders = new Set<string>();
  for (const row of confirmedRows) {
    builders.add(row.helperId);
    if (row.helpedId) builders.add(row.helpedId);
  }

  return {
    awaiting: awaitingRows.map(toItem),
    given: givenRows.map(toItem),
    feed: feedRows.map((row) => {
      const named = Boolean(row.helperOk && row.helpedOk);
      return {
        evidenceId: row.evidence.id,
        title: row.evidence.title,
        occurredAt: row.evidence.occurredAt.toISOString(),
        helperName: named ? row.helperName : null,
        helpedName: named ? row.helpedName : null,
      };
    }),
    totals: { confirmed: confirmedRows.length, builders: builders.size },
  };
}
