import { and, eq, isNotNull } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { communityAccessState, communityConnections } from "@/lib/db/schema";
import { getMemberTier } from "@/lib/membership/member-access";
import { getCommunityAdapter } from "./registry";
import { PROVIDER_FOR_TARGET, ProviderError, type ApplyResult, type CommunityTarget, type MembershipTier } from "./types";

export interface ReconcileResult extends ApplyResult {
  desiredTier: MembershipTier;
}

async function writeState(
  db: AppDb,
  userId: string,
  target: CommunityTarget,
  desiredTier: MembershipTier,
  result: ApplyResult,
  now: Date
): Promise<void> {
  const values = {
    desiredTier,
    appliedTier: result.appliedTier,
    status: result.status,
    errorCode: result.errorCode ?? null,
    updatedAt: now,
  };
  await db
    .insert(communityAccessState)
    .values({ userId, target, ...values, createdAt: now })
    .onConflictDoUpdate({ target: [communityAccessState.userId, communityAccessState.target], set: values });
}

/**
 * Converge one user's access on one community target. The desired tier comes only from
 * `getMemberTier` (verified Polar state of the customer linked through NLB), never from the client.
 * A connection with a pending unlink converges to no access instead, and its row is deleted once the
 * adapter reports the access revoked (or the account was never in the community); any other outcome
 * keeps the row so the unlink is retried. Running unlink here, under the same job dedupe key as every
 * other reconcile for this user and target, serializes it with grants.
 * The outcome is recorded in `community_access_state`. Retryable failures are recorded as
 * `retrying` and rethrown as `ProviderError` so the job backs off; permanent ones are recorded and
 * returned.
 */
export async function reconcileCommunityAccess(
  db: AppDb,
  userId: string,
  target: CommunityTarget,
  now: Date = new Date()
): Promise<ReconcileResult> {
  const { tier: desiredTier } = await getMemberTier(db, userId, now);
  const [connection] = await db
    .select()
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, PROVIDER_FOR_TARGET[target])))
    .limit(1);
  const [current] = await db
    .select()
    .from(communityAccessState)
    .where(and(eq(communityAccessState.userId, userId), eq(communityAccessState.target, target)))
    .limit(1);
  const unlinking = Boolean(connection?.unlinkRequestedAt);

  let result: ApplyResult;
  try {
    result = await getCommunityAdapter(target).apply({
      db,
      userId,
      target,
      desiredTier: unlinking ? "none" : desiredTier,
      connection: connection ?? null,
      current: current ?? null,
    });
  } catch (error) {
    const providerError =
      error instanceof ProviderError ? error : new ProviderError("adapter_error", { retryable: true });
    result = {
      status: providerError.retryable ? "retrying" : "action_required",
      appliedTier: current?.appliedTier ?? "none",
      errorCode: providerError.code,
      retryable: providerError.retryable,
      retryAfterMs: providerError.retryAfterMs,
    };
  }

  if (result.retryable) {
    await writeState(db, userId, target, desiredTier, { ...result, status: "retrying" }, now);
    throw new ProviderError(result.errorCode ?? "retryable", { retryable: true, retryAfterMs: result.retryAfterMs });
  }

  if (connection && unlinking && (result.status === "revoked" || result.status === "not_connected")) {
    await db
      .delete(communityConnections)
      .where(and(eq(communityConnections.id, connection.id), isNotNull(communityConnections.unlinkRequestedAt)));
    result = { status: "not_connected", appliedTier: "none" };
  }

  await writeState(db, userId, target, desiredTier, result, now);
  return { ...result, desiredTier };
}
