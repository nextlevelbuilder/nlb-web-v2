/**
 * Request plumbing and response shapes shared by the progression routes
 * (`/api/v1/builder-{badges,missions,seasons,rewards,time-capsule}` and `builder-admin/rewards/**`).
 */
import { BuilderApiError } from "./http";
import { describeRequirement, type MemberReward, type RewardClaim, type RewardItem } from "./rewards";
import type { TimeCapsuleEntry } from "./time-capsule";

const MAX_BODY_BYTES = 32 * 1024;

/** Reads a small JSON body; an empty body is `{}`. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new BuilderApiError(413, "payload_too_large", "Request body is too large.");
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BuilderApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

/** `?locale=vi` for Vietnamese labels; English otherwise. */
export function requestLocale(request: Request): "en" | "vi" {
  return new URL(request.url).searchParams.get("locale") === "vi" ? "vi" : "en";
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

export function serializeClaim(claim: RewardClaim) {
  return {
    id: claim.id,
    rewardId: claim.rewardId,
    userId: claim.userId,
    periodKey: claim.periodKey,
    status: claim.status,
    note: claim.note,
    decidedAt: iso(claim.decidedAt),
    expiresAt: iso(claim.expiresAt),
    createdAt: iso(claim.createdAt),
  };
}

export function serializeRewardItem(item: RewardItem, locale: "en" | "vi") {
  return {
    id: item.id,
    key: item.key,
    kind: item.kind,
    title: item.title[locale],
    description: item.description[locale],
    inventory: item.inventory,
    availableFrom: iso(item.availableFrom),
    availableUntil: iso(item.availableUntil),
  };
}

export function serializeMemberReward(reward: MemberReward, locale: "en" | "vi") {
  const describe = (list: { requirement: Parameters<typeof describeRequirement>[0]; met: boolean }[]) =>
    list.map(({ requirement, met }) => ({ ...requirement, label: describeRequirement(requirement, locale), met }));
  return {
    ...serializeRewardItem(reward.item, locale),
    availability: reward.availability,
    periodKey: reward.periodKey,
    eligibility: reward.eligibility
      ? {
          eligible: reward.eligibility.eligible,
          period: reward.eligibility.period,
          allOf: describe(reward.eligibility.allOf),
          anyOf: describe(reward.eligibility.anyOf),
        }
      : null,
    claim: reward.claim ? serializeClaim(reward.claim) : null,
  };
}

export function serializeAdminRewardItem(item: RewardItem) {
  return {
    id: item.id,
    key: item.key,
    kind: item.kind,
    title: item.title,
    description: item.description,
    eligibility: item.eligibility,
    inventory: item.inventory,
    budgetNote: item.budgetNote,
    availableFrom: iso(item.availableFrom),
    availableUntil: iso(item.availableUntil),
    active: item.active,
    updatedAt: iso(item.updatedAt),
  };
}

export function serializeCapsuleEntry(entry: TimeCapsuleEntry | null) {
  if (!entry) return null;
  return {
    id: entry.id,
    year: entry.year,
    kind: entry.kind,
    body: entry.body,
    visibility: entry.visibility,
    version: entry.version,
    createdAt: iso(entry.createdAt),
  };
}
