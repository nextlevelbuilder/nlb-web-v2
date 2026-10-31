/**
 * Request plumbing of the affiliate member routes. Caller resolution, same-site protection for cookie
 * writes, JSON bodies and `Idempotency-Key` replay are the shared `/api/v1` helpers used by Live; this
 * module adds the `AFFILIATES_ENABLED` gate and binds every call to one signed-in user.
 */
import type { ResolvedCaller } from "@/lib/auth-api-key";
import type { AppDb } from "@/lib/db";
import { env } from "@/lib/env";
import type { AccessSubject } from "@/lib/access/types";
import { BuilderApiError } from "@/lib/builder-league/http";
import { accessDenied } from "@/lib/live/http/live-http-errors";
import { memberDelegationScope, resolveLiveSubject } from "@/lib/live/http/live-request-context";
import { findAffiliateByUser, type AffiliateRow } from "@/lib/referrals/affiliates";
import { ReferralError } from "@/lib/referrals/referral-errors";
import { isAffiliatesEnabled } from "@/lib/referrals/referral-env";
import { sessionRequired } from "./referral-http-errors";

/** Member APIs answer 404 while `AFFILIATES_ENABLED` is off, so the program does not leak before launch. */
export function assertAffiliatesEnabled(): void {
  if (!isAffiliatesEnabled()) throw new BuilderApiError(404, "not_found", "Not found");
}

export interface AffiliateMemberCaller {
  caller: ResolvedCaller;
  subject: AccessSubject;
  userId: string;
}

/**
 * The signed-in caller of a member route: a session, an API key, or an MCP delegation signed for
 * `mcp:read` (GET) or `mcp:write` (writes). Session writes must be same-site. No caller is a 401.
 */
export async function requireAffiliateCaller(request: Request, db: AppDb): Promise<AffiliateMemberCaller> {
  const { caller, subject } = await resolveLiveSubject(request, db, memberDelegationScope(request));
  if (!caller || !subject.userId) throw accessDenied("unauthenticated");
  return { caller, subject, userId: subject.userId };
}

/** Refuses API keys and MCP delegations with 403 `session_required` (payout details are browser-only). */
export function assertSessionCaller(caller: Pick<ResolvedCaller, "authType">): void {
  if (caller.authType !== "session") throw sessionRequired();
}

/** Origin used for absolute referral link URLs: the configured site URL, else the request origin. */
export function publicOrigin(request: Request): string {
  return env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

/** Optional integer query value clamped to `1..max`; anything malformed is a 400. */
export function parseBoundedInt(value: string | null, name: string, fallback: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new BuilderApiError(400, "invalid_input", `${name} must be a positive integer`);
  return Math.min(parsed, max);
}

/** The caller's affiliate account (any status), or 404 `not_enrolled`. */
export async function requireEnrolledAffiliate(db: AppDb, userId: string): Promise<AffiliateRow> {
  const affiliate = await findAffiliateByUser(db, userId);
  if (!affiliate) throw new ReferralError(404, "not_enrolled", "Join the affiliate program first");
  return affiliate;
}
