import type { AppDb } from "@/lib/db";
import type {
  CommunityAccessStatusValue,
  CommunityProvider,
  CommunityTargetValue,
  communityAccessState,
  communityConnections,
} from "@/lib/db/schema";
import type { MembershipTier } from "@/lib/membership/effective-tier";

export type { MembershipTier, CommunityProvider };
export type CommunityTarget = CommunityTargetValue;
export type AccessStatus = CommunityAccessStatusValue;
export type CommunityConnection = typeof communityConnections.$inferSelect;
export type CommunityAccessStateRow = typeof communityAccessState.$inferSelect;

export const COMMUNITY_TARGETS: readonly CommunityTarget[] = ["discord_guild", "telegram_group"];

export const PROVIDER_FOR_TARGET: Readonly<Record<CommunityTarget, CommunityProvider>> = {
  discord_guild: "discord",
  telegram_group: "telegram",
};

/** Everything an adapter needs to converge one user's access on one target. */
export interface ApplyInput {
  db: AppDb;
  userId: string;
  target: CommunityTarget;
  /** Derived only from verified Polar subscription state (`getMemberTier`). */
  desiredTier: MembershipTier;
  /** The account linked through NLB, or null when the user has not linked this provider. */
  connection: CommunityConnection | null;
  /** Last recorded state for this user and target, or null on first reconcile. */
  current: CommunityAccessStateRow | null;
}

export interface ApplyResult {
  status: AccessStatus;
  appliedTier: MembershipTier;
  /** Short machine code, never provider response bodies or personal data. */
  errorCode?: string;
  /** True when the job should back off and retry. */
  retryable?: boolean;
  retryAfterMs?: number;
}

/** Converges a community target (Discord guild roles, Telegram group membership) to a desired tier. */
export interface CommunityAdapter {
  target: CommunityTarget;
  provider: CommunityProvider;
  apply(input: ApplyInput): Promise<ApplyResult>;
}

/** Upper bound for one provider HTTP call (Discord, Telegram, Polar, admin webhook) made by jobs. */
export const PROVIDER_FETCH_TIMEOUT_MS = 10_000;

/** Whether a fetch failed because its `AbortSignal.timeout` fired. */
export function isFetchTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** A provider call failed. `code` is safe to store and log; the message must not carry secrets or PII. */
export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(code: string, options: { retryable?: boolean; retryAfterMs?: number; message?: string } = {}) {
    super(options.message ?? code);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}
