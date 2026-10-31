/**
 * Boundary validation for `/api/v1/affiliate-admin` bodies: shapes are checked here (unknown keys
 * refused) and the domain services still enforce their own rules (rules invariants, period format,
 * amounts, state machine).
 */
import { z } from "zod";
import type { ProgramRules } from "@/lib/referrals/types";

export const id = z.string().trim().min(1).max(200);
const bps = z.number().int();

const levelSchema = z
  .object({ key: z.string().max(32), minCustomers: z.number().int(), ordinaryBudgetBps: bps, memberBudgetBps: bps })
  .strict();

/** A complete rules document; `validateProgramRules` checks the invariants (ranges, ordering, budgets). */
export const programRulesSchema = z
  .object({
    currency: z.string().max(3),
    levels: z.array(levelSchema).min(1).max(10),
    eligiblePlans: z.array(z.enum(["premium", "vip"])).min(1).max(2),
    attributionWindowDays: z.number().int(),
    holdDays: z.number().int(),
    payoutThresholdMinor: z.number().int(),
    paypalServiceFeeBps: bps,
    bankVnServiceFeeBps: bps,
    withholding: z.object({ vnIndividualBps: bps.nullable(), vnBusinessBps: bps.nullable(), otherBps: bps.nullable() }).strict(),
    termsVersion: z.string().max(40),
  })
  .strict() satisfies z.ZodType<ProgramRules>;

const note = z.string().trim().max(500).nullable().optional();
/** Operator free text kept on the record (suspension, hold) or only hashed into the audit row. */
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
/** `approvalId` is optional at the boundary so a missing one is refused by the guard (409 `approval_required`) and audited. */
const approvalId = id.optional();

export const rulesTargetSchema = z.object({ rules: programRulesSchema, note }).strict();
export const rulesPreviewSchema = z.object({ rules: programRulesSchema }).strict();
export const rulesPublishSchema = z.object({ rules: programRulesSchema, note, approvalId }).strict();

export const batchTargetSchema = z.object({ batchId: id }).strict();
export const batchCreateSchema = z.object({ period: z.string().max(7) }).strict();
export const batchApproveSchema = z.object({ approvalId }).strict();
export const emptySchema = z.object({}).strict();

export const markPaidSchema = z
  .object({
    externalReference: z.string().max(120),
    payoutCurrency: z.string().max(3),
    fxRate: z.union([z.string().max(20), z.number()]).nullable().optional(),
    payoutAmountMinor: z.number().int(),
    providerFeeMinor: z.number().int().nullable().optional(),
  })
  .strict();

const adjustFields = {
  affiliateId: id,
  amountMinor: z.number().int().refine((value) => value !== 0 && Math.abs(value) <= 10_000_000, "amountMinor must be a non-zero integer"),
  reason: z.string().trim().min(5).max(300),
};
export const adjustTargetSchema = z.object(adjustFields).strict();
export const adjustmentSchema = z.object({ ...adjustFields, approvalId }).strict();
