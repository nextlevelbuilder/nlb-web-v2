/**
 * Automatic fraud heuristics, evaluated once when a conversion is created from a settled order. Any
 * match accrues the conversion as `held` (hold reason `risk:<signals>`) so an operator reviews it and
 * releases or reverses it; nothing is refused and no money is lost by a false positive.
 *
 * - `velocity`: the affiliate already has `velocityMaxConversions` conversions inside the last
 *   `velocityWindowHours` (this one would exceed it).
 * - `shared_instrument`: the affiliate's payout instrument (PayPal email or bank account, as a keyed
 *   hash) is also registered by another affiliate: one person running several affiliate accounts.
 * - `device_cluster`: the buyer checked out from a device seen on the affiliate's own session, or from
 *   a device that `deviceClusterMinBuyers` distinct referred buyers of this affiliate used inside the
 *   window (fake buyer accounts created on one machine).
 *
 * The checks read state before the conversion is written. Concurrent conversions can each miss the
 * other, which is acceptable for a review heuristic: money correctness never depends on it.
 */
import { and, countDistinct, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateAttributions, affiliateConversions, affiliatePayoutMethods } from "@/lib/db/schema";
import { fraudRulesOf } from "./program-rules";
import { isAffiliateDevice } from "./risk-signals";
import type { FraudSignal, ProgramRules } from "./types";

const HOUR_MS = 60 * 60 * 1000;

export interface ConversionRiskInput {
  affiliateId: string;
  buyerUserId: string;
  /** Device hash recorded on the attribution snapshot at checkout, if any. */
  deviceHash: string | null;
  now: Date;
}

export async function velocityHit(db: AppDb, rules: ProgramRules, input: ConversionRiskInput): Promise<boolean> {
  const fraud = fraudRulesOf(rules);
  const since = new Date(input.now.getTime() - fraud.velocityWindowHours * HOUR_MS);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(affiliateConversions)
    .where(and(eq(affiliateConversions.affiliateId, input.affiliateId), gte(affiliateConversions.createdAt, since)));
  return Number(row?.count ?? 0) >= fraud.velocityMaxConversions;
}

/** Whether any payout instrument of this affiliate (active or archived) is also registered by another affiliate. */
export async function sharedInstrumentHit(db: AppDb, affiliateId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: affiliatePayoutMethods.id })
    .from(affiliatePayoutMethods)
    .where(
      and(
        ne(affiliatePayoutMethods.affiliateId, affiliateId),
        isNotNull(affiliatePayoutMethods.instrumentHash),
        sql`${affiliatePayoutMethods.instrumentHash} in (select m.instrument_hash from affiliate_payout_methods m where m.affiliate_id = ${affiliateId} and m.instrument_hash is not null)`
      )
    )
    .limit(1);
  return Boolean(row);
}

export async function deviceClusterHit(db: AppDb, rules: ProgramRules, input: ConversionRiskInput): Promise<boolean> {
  if (!input.deviceHash) return false;
  if (await isAffiliateDevice(db, input.affiliateId, input.deviceHash)) return true;
  const fraud = fraudRulesOf(rules);
  const since = new Date(input.now.getTime() - fraud.deviceClusterWindowDays * 24 * HOUR_MS);
  const [row] = await db
    .select({ buyers: countDistinct(affiliateAttributions.buyerUserId) })
    .from(affiliateAttributions)
    .where(
      and(
        eq(affiliateAttributions.affiliateId, input.affiliateId),
        eq(affiliateAttributions.deviceHash, input.deviceHash),
        ne(affiliateAttributions.buyerUserId, input.buyerUserId),
        gte(affiliateAttributions.createdAt, since)
      )
    );
  // Other buyers on this device, plus this buyer.
  return Number(row?.buyers ?? 0) + 1 >= fraud.deviceClusterMinBuyers;
}

/** Every heuristic that matches this conversion, in a stable order. */
export async function evaluateConversionRisk(db: AppDb, rules: ProgramRules, input: ConversionRiskInput): Promise<FraudSignal[]> {
  const [velocity, sharedInstrument, deviceCluster] = await Promise.all([
    velocityHit(db, rules, input),
    sharedInstrumentHit(db, input.affiliateId),
    deviceClusterHit(db, rules, input),
  ]);
  const signals: FraudSignal[] = [];
  if (velocity) signals.push("velocity");
  if (sharedInstrument) signals.push("shared_instrument");
  if (deviceCluster) signals.push("device_cluster");
  return signals;
}

/** Hold reason recorded for automatic holds, e.g. `risk:velocity,device_cluster`. */
export function riskHoldReason(signals: FraudSignal[]): string | null {
  return signals.length > 0 ? `risk:${signals.join(",")}` : null;
}
