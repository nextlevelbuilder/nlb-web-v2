/**
 * Boundary shapes of `/api/v1/affiliates` bodies. Unknown keys are refused here; values are checked by
 * the domain services (code format, budget, destination allowlist, payout details), so their messages
 * stay the single source of truth.
 */
import { z } from "zod";

export const enrollSchema = z.object({ termsVersion: z.string().max(40) }).strict();

const linkFields = {
  label: z.unknown().optional(),
  discountBps: z.unknown().optional(),
  destinationPath: z.unknown().optional(),
  utmCampaign: z.unknown().optional(),
};
export const linkCreateSchema = z.object({ code: z.unknown().optional(), ...linkFields }).strict();
export const linkUpdateSchema = z.object({ ...linkFields, status: z.unknown().optional(), expectedVersion: z.unknown().optional() }).strict();

export const payoutMethodSchema = z
  .object({
    type: z.unknown(),
    payeeType: z.unknown(),
    residency: z.unknown(),
    paypalEmail: z.unknown().optional(),
    bankName: z.unknown().optional(),
    accountHolder: z.unknown().optional(),
    accountNumber: z.unknown().optional(),
  })
  .strict();
