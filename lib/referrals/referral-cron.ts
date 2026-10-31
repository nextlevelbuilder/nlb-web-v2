/**
 * Affiliate housekeeping, run from the `scheduled` handler in worker.ts: commissions whose refund hold
 * has passed move from `pending` to `available`. It rides on the existing hourly trigger, runs whatever
 * `AFFILIATES_ENABLED` says (accrued commission must mature even while new attribution is paused), and
 * is idempotent: each conversion is claimed with a conditional update and keyed in the ledger.
 */
import { createDb } from "@/lib/db";
import { matureConversions } from "./affiliate-conversions";

/** The hourly trigger already declared in wrangler.jsonc (`triggers.crons`). */
export const REFERRAL_CRON = "17 * * * *";

export async function runReferralCron(env: { DB: D1Database }, now = new Date()): Promise<{ matured: number }> {
  const db = createDb(env.DB);
  let matured = 0;
  // Bounded batches so a backlog drains over a few runs without exceeding the Worker CPU budget.
  for (let round = 0; round < 5; round++) {
    const count = await matureConversions(db, now, 200);
    matured += count;
    if (count < 200) break;
  }
  return { matured };
}
