/**
 * Canonical resource and arguments of each sensitive affiliate operator action. The approval request
 * route and the action route both derive them here, so the approval's `args_hash` always matches what
 * the action consumes (`requireOperator` hashes `args` and compares it with the approved row).
 *
 * - `affiliate.rules.publish`  → resource `affiliate:rules`,                args `{ rules, note }` (validated, levels sorted)
 * - `affiliate.payout.approve` → resource `affiliate:payout_batch:<id>`,     args `{ batchId }`
 * - `affiliate.ledger.adjust`  → resource `affiliate:affiliate:<id>`,        args `{ affiliateId, amountMinor, reason }`
 */
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { findAffiliateById } from "@/lib/referrals/affiliates";
import { getPayoutBatch } from "@/lib/referrals/affiliate-payouts";
import { validateProgramRules } from "@/lib/referrals/program-rules";
import { referralNotFound } from "@/lib/referrals/referral-errors";
import type { ProgramRules } from "@/lib/referrals/types";
import { adjustTargetSchema, batchTargetSchema, rulesTargetSchema } from "./affiliate-operator-schemas";

export const AFFILIATE_SENSITIVE_ACTIONS = ["affiliate.rules.publish", "affiliate.payout.approve", "affiliate.ledger.adjust"] as const;
export type AffiliateSensitiveAction = (typeof AFFILIATE_SENSITIVE_ACTIONS)[number];

export const affiliateApprovalRequestSchema = z
  .object({
    action: z.enum(AFFILIATE_SENSITIVE_ACTIONS),
    /** `{ rules, note? }`, `{ batchId }` or `{ affiliateId, amountMinor, reason }` depending on `action`. */
    target: z.record(z.unknown()),
    reason: z.string().trim().min(1).max(500),
    ttlMinutes: z.number().int().min(1).max(24 * 60).optional(),
  })
  .strict();

export interface AffiliateSensitiveTarget {
  resource: string;
  args: Record<string, unknown>;
}

export function rulesPublishTarget(rules: ProgramRules, note: string | null | undefined): AffiliateSensitiveTarget & { rules: ProgramRules } {
  const validated = validateProgramRules(rules);
  return { resource: "affiliate:rules", args: { rules: validated, note: note?.trim() || null }, rules: validated };
}

export function payoutApproveTarget(batchId: string): AffiliateSensitiveTarget {
  return { resource: `affiliate:payout_batch:${batchId}`, args: { batchId } };
}

export function ledgerAdjustTarget(input: { affiliateId: string; amountMinor: number; reason: string }): AffiliateSensitiveTarget {
  return {
    resource: `affiliate:affiliate:${input.affiliateId}`,
    args: { affiliateId: input.affiliateId, amountMinor: input.amountMinor, reason: input.reason.trim() },
  };
}

export async function requireAffiliateExists(db: AppDb, affiliateId: string): Promise<void> {
  if (!(await findAffiliateById(db, affiliateId))) throw referralNotFound("Affiliate");
}

/** Validates `target` for `action` (404 for an unknown batch or affiliate) and returns its canonical resource and arguments. */
export async function resolveAffiliateSensitiveTarget(db: AppDb, action: AffiliateSensitiveAction, target: unknown): Promise<AffiliateSensitiveTarget> {
  switch (action) {
    case "affiliate.rules.publish": {
      const { rules, note } = rulesTargetSchema.parse(target);
      const { resource, args } = rulesPublishTarget(rules, note);
      return { resource, args };
    }
    case "affiliate.payout.approve": {
      const { batchId } = batchTargetSchema.parse(target);
      await getPayoutBatch(db, batchId);
      return payoutApproveTarget(batchId);
    }
    case "affiliate.ledger.adjust": {
      const input = adjustTargetSchema.parse(target);
      await requireAffiliateExists(db, input.affiliateId);
      return ledgerAdjustTarget(input);
    }
  }
}
