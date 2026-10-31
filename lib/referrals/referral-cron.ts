/**
 * Affiliate housekeeping, run from the `scheduled` handler in worker.ts: commissions whose refund hold
 * has passed move from `pending` to `available`. It rides on the existing hourly trigger, runs whatever
 * `AFFILIATES_ENABLED` says (accrued commission must mature even while new attribution is paused), and
 * is idempotent: each conversion is claimed and moved in one atomic batch and keyed in the ledger.
 *
 * Query budget: at most `MATURATION_MAX_ROUNDS` batches of two statements each (up to
 * `MATURATION_BATCH_SIZE` conversions per batch), far below D1's limit of 1000 queries per invocation.
 * A larger backlog drains over the following hourly runs.
 */
import { createDb } from "@/lib/db";
import { matureDueConversions } from "./affiliate-conversions";

/** The hourly trigger already declared in wrangler.jsonc (`triggers.crons`). */
export const REFERRAL_CRON = "17 * * * *";

export async function runReferralCron(env: { DB: D1Database }, now = new Date()): Promise<{ matured: number }> {
  return { matured: await matureDueConversions(createDb(env.DB), now) };
}
