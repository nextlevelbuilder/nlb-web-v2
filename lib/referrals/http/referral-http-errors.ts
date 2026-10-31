/**
 * Error mapping for `/api/v1/affiliates` and `/api/v1/affiliate-admin`. `ReferralError` keeps its
 * status and stable code; everything else (operator denies and approval failures, same-site and
 * Idempotency-Key errors, zod validation, unknown errors as a logged generic 500) goes through the
 * shared Live mapping so both APIs render the same `{ error: { code, message, details? } }` envelope.
 */
import { BuilderApiError, fail } from "@/lib/builder-league/http";
import { liveErrorResponse } from "@/lib/live/http/live-http-errors";
import { ReferralError } from "@/lib/referrals/referral-errors";

export function referralErrorResponse(err: unknown): Response {
  if (err instanceof ReferralError) return fail(err.status, err.code, undefined, err.message);
  return liveErrorResponse(err);
}

export async function withReferralErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    return referralErrorResponse(err);
  }
}

/** Payout details are handled only by a person in the browser: API keys and MCP delegations get a 403. */
export function sessionRequired(): BuilderApiError {
  return new BuilderApiError(403, "session_required", "This action is only available when signed in on the website");
}
