/**
 * Ship Relay core: peer help is CONTRIBUTE evidence that names the helped member as counterparty, and the
 * counterparty confirms it. Confirmation is refused when it would be self-confirmation, when both
 * accounts are linked to the same Discord identity, or when the pair (in either direction) already has
 * as many confirmed help records in the cap window as the ruleset allows per counterparty, which stops
 * A↔B confirmation rings. The cap check and the confirmation are one conditional UPDATE, so concurrent
 * confirmations cannot both slip under the cap.
 *
 * When the ruleset accepts peer confirmation as sufficient verification, the confirmed evidence is
 * approved by the system and awarded at once; when it requires a moderator, it stays in the queue.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { activityEvidence } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { getDiscordIdentity } from "./membership";
import { getEffectiveRuleset, meetsVerification, type CapRule, type EventDefinition } from "./ruleset";
import { periodKey, periodRange } from "./time-windows";
import { isEventTypeKey, type ActorRole } from "./types";
import { OPEN_EVIDENCE_STATUSES, auditIfChanged, getEvidence, type Evidence } from "./evidence";
import { SYSTEM_ACTOR_ID, approveEvidence, completeApproval, type ApprovalOutcome } from "./moderation";

/** Used when a ruleset defines no per-counterparty cap: one confirmed help per pair per week. */
const DEFAULT_PAIR_CAP: CapRule = { window: "week", per: "counterparty", max: 1 };

export interface Confirmer {
  userId: string;
  actorRole: ActorRole;
}

export interface ConfirmationOutcome {
  evidence: Evidence;
  /** False when the evidence was already confirmed (idempotent replay). */
  confirmed: boolean;
  /** Set when the ruleset lets peer confirmation stand in for a moderator and the award was made. */
  approval: ApprovalOutcome | null;
  requiresModerator: boolean;
}

function confirmableDefinition(evidence: Evidence): EventDefinition {
  const definition = isEventTypeKey(evidence.eventType) ? getEffectiveRuleset(evidence.occurredAt).events[evidence.eventType] : undefined;
  if (!definition?.evidence.counterpartyConfirmation) {
    throw new BuilderApiError(409, "not_confirmable", "This evidence does not need a counterparty confirmation.");
  }
  return definition;
}

export function pairCapRule(definition: EventDefinition): CapRule {
  return definition.caps.find((rule) => rule.per === "counterparty") ?? DEFAULT_PAIR_CAP;
}

/** Inclusive epoch-ms window of the cap around `at`; lifetime caps span all time. */
export function capWindow(rule: CapRule, at: Date): { start: number; end: number } {
  if (rule.window === "lifetime") return { start: 0, end: Number.MAX_SAFE_INTEGER };
  const range = periodRange(rule.window, periodKey(rule.window, at));
  return { start: range.start.getTime(), end: range.end.getTime() };
}

/** True when both members linked the same Discord account (one person, two accounts). */
export async function sharesDiscordIdentity(db: AppDb, a: string, b: string): Promise<boolean> {
  const [first, second] = await Promise.all([getDiscordIdentity(db, a), getDiscordIdentity(db, b)]);
  return Boolean(first && second && first.externalUserId === second.externalUserId);
}

function wantsSystemApproval(definition: EventDefinition): boolean {
  // Peer confirmation is enough unless the ruleset asks for a moderator or the system.
  return meetsVerification("peer_confirmed", definition.requiredVerification);
}

export async function confirmPeerHelp(db: AppDb, evidenceId: string, confirmer: Confirmer): Promise<ConfirmationOutcome> {
  if (confirmer.actorRole !== "member" && confirmer.actorRole !== "admin") {
    throw new BuilderApiError(403, "confirmation_requires_session", "Only the named member, signed in, can confirm peer help.");
  }
  const evidence = await getEvidence(db, evidenceId);
  if (!evidence || evidence.counterpartyUserId !== confirmer.userId) throw new BuilderApiError(404, "not_found", "Evidence not found.");
  if (evidence.userId === confirmer.userId) throw new BuilderApiError(403, "self_confirmation", "You cannot confirm your own help.");
  const definition = confirmableDefinition(evidence);
  const requiresModerator = !wantsSystemApproval(definition);

  if (evidence.counterpartyConfirmedAt) {
    const approval = evidence.status === "approved" && evidence.decidedBy === SYSTEM_ACTOR_ID ? { ...(await completeApproval(db, evidence)), decided: false } : null;
    return { evidence, confirmed: false, approval, requiresModerator };
  }
  if (!(OPEN_EVIDENCE_STATUSES as readonly string[]).includes(evidence.status)) {
    throw new BuilderApiError(409, "evidence_locked", `Evidence that is ${evidence.status} cannot be confirmed.`, { status: evidence.status });
  }
  if (await sharesDiscordIdentity(db, evidence.userId, confirmer.userId)) {
    throw new BuilderApiError(403, "same_discord_identity", "Both accounts are linked to the same Discord identity.");
  }

  const rule = pairCapRule(definition);
  const window = capWindow(rule, evidence.occurredAt);
  const helper = evidence.userId;
  const helped = confirmer.userId;
  const now = new Date();
  const [updated] = await db.batch([
    db
      .update(activityEvidence)
      .set({ counterpartyConfirmedAt: now, updatedAt: now })
      .where(
        and(
          eq(activityEvidence.id, evidence.id),
          eq(activityEvidence.counterpartyUserId, helped),
          isNull(activityEvidence.counterpartyConfirmedAt),
          inArray(activityEvidence.status, [...OPEN_EVIDENCE_STATUSES]),
          sql`(select count(*) from activity_evidence pair
                where pair.event_type = ${evidence.eventType}
                  and pair.counterparty_confirmed_at is not null
                  and pair.status not in ('rejected', 'withdrawn')
                  and ((pair.user_id = ${helper} and pair.counterparty_user_id = ${helped})
                    or (pair.user_id = ${helped} and pair.counterparty_user_id = ${helper}))
                  and pair.occurred_at between ${window.start} and ${window.end}) < ${rule.max}`
        )
      )
      .returning(),
    auditIfChanged(db, {
      targetType: "evidence",
      targetId: evidence.id,
      action: "confirm",
      actorId: confirmer.userId,
      actorRole: confirmer.actorRole,
      reasonCodes: ["counterparty_confirmed"],
    }),
  ]);

  let confirmed = updated[0];
  if (!confirmed) {
    const latest = await getEvidence(db, evidence.id);
    if (latest?.counterpartyConfirmedAt) return { evidence: latest, confirmed: false, approval: null, requiresModerator };
    if (latest && !(OPEN_EVIDENCE_STATUSES as readonly string[]).includes(latest.status)) {
      throw new BuilderApiError(409, "evidence_locked", `Evidence that is ${latest.status} cannot be confirmed.`, { status: latest.status });
    }
    throw new BuilderApiError(409, "circular_confirmation_cap", "You two already confirmed help for each other in this period.", {
      window: rule.window,
      max: rule.max,
    });
  }

  let approval: ApprovalOutcome | null = null;
  if (!requiresModerator && confirmed.status === "submitted") {
    try {
      approval = await approveEvidence(db, confirmed.id, { actorId: SYSTEM_ACTOR_ID, actorRole: "system" }, {
        fromStatuses: ["submitted"],
        reasonCodes: ["peer_confirmed"],
        note: null,
      });
      confirmed = approval.evidence;
    } catch (err) {
      // The confirmation stands; a moderator can still approve from the queue.
      if (!(err instanceof BuilderApiError) || err.status !== 409) throw err;
    }
  }
  return { evidence: confirmed, confirmed: true, approval, requiresModerator };
}
