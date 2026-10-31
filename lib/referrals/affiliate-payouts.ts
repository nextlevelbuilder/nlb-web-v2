/**
 * Monthly manual payouts. NLB never sends money automatically: an operator previews a closed period,
 * creates a batch (which locks each payee's available balance in the ledger), a second operator
 * approves it through the two-person approval flow, then a person transfers the money outside the
 * system and records each transfer with its external reference. Recording is gated by
 * `AFFILIATE_PAYOUTS_ENABLED` until the legal/finance review is signed off.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import {
  affiliatePayoutBatches,
  affiliatePayoutItems,
  affiliatePayoutMethods,
  affiliateVerifications,
  affiliates,
  commissionLedger,
} from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { isUniqueViolation } from "@/lib/membership/member-access";
import { affiliateBalances, ledgerInsert, recordLedgerMove } from "./commission-ledger";
import { matureConversions } from "./affiliate-conversions";
import { payoutAmounts } from "./program-math";
import { getActiveRules } from "./program-rules";
import { ReferralError, referralInvalid, referralNotFound } from "./referral-errors";
import { isAffiliatePayoutsEnabled } from "./referral-env";
import type { PayeeResidency, PayeeType, PayoutMethodType, ProgramRules } from "./types";

export type PayoutBatchRow = typeof affiliatePayoutBatches.$inferSelect;
export type PayoutItemRow = typeof affiliatePayoutItems.$inferSelect;
export type PayoutMethodRow = typeof affiliatePayoutMethods.$inferSelect;

// ------------------------------------------------------------------
// Payout methods (self-service, session only; never via API key or MCP)
// ------------------------------------------------------------------

export interface PayoutMethodInput {
  type: unknown;
  payeeType: unknown;
  residency: unknown;
  paypalEmail?: unknown;
  bankName?: unknown;
  accountHolder?: unknown;
  accountNumber?: unknown;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

function mask(value: string, visible = 4): string {
  return `••••${value.slice(-visible)}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** Replaces the affiliate's active payout method. Details are sealed; only a masked hint is kept readable. */
export async function setPayoutMethod(db: AppDb, affiliateId: string, input: PayoutMethodInput, now = new Date()): Promise<PayoutMethodRow> {
  const type = input.type as PayoutMethodType;
  const payeeType = input.payeeType as PayeeType;
  const residency = input.residency as PayeeResidency;
  if (type !== "paypal" && type !== "bank_vn") throw referralInvalid("type must be paypal or bank_vn");
  if (payeeType !== "individual" && payeeType !== "business") throw referralInvalid("payeeType must be individual or business");
  if (residency !== "vn" && residency !== "other") throw referralInvalid("residency must be vn or other");

  let details: Record<string, string>;
  let displayHint: string;
  if (type === "paypal") {
    const email = typeof input.paypalEmail === "string" ? input.paypalEmail.trim() : "";
    if (!EMAIL_RE.test(email)) throw referralInvalid("paypalEmail is invalid");
    details = { paypalEmail: email };
    displayHint = `PayPal ${maskEmail(email)}`;
  } else {
    const bankName = typeof input.bankName === "string" ? input.bankName.trim() : "";
    const accountHolder = typeof input.accountHolder === "string" ? input.accountHolder.trim() : "";
    const accountNumber = typeof input.accountNumber === "string" ? input.accountNumber.replace(/\s+/g, "") : "";
    if (!bankName || bankName.length > 100) throw referralInvalid("bankName is required");
    if (!accountHolder || accountHolder.length > 120) throw referralInvalid("accountHolder is required");
    if (!/^\d{6,20}$/.test(accountNumber)) throw referralInvalid("accountNumber must be 6-20 digits");
    if (residency !== "vn") throw referralInvalid("Vietnamese bank transfers are for payees resident in Vietnam");
    details = { bankName, accountHolder, accountNumber };
    displayHint = `${bankName} ${mask(accountNumber)}`;
  }
  const sealedDetails = await encryptSecret(JSON.stringify(details));
  await db
    .update(affiliatePayoutMethods)
    .set({ status: "archived", updatedAt: now })
    .where(and(eq(affiliatePayoutMethods.affiliateId, affiliateId), eq(affiliatePayoutMethods.status, "active")));
  const [row] = await db
    .insert(affiliatePayoutMethods)
    .values({ affiliateId, type, sealedDetails, displayHint, payeeType, residency, createdAt: now, updatedAt: now })
    .returning();
  return row;
}

export async function activePayoutMethod(db: AppDb, affiliateId: string): Promise<PayoutMethodRow | null> {
  const [row] = await db
    .select()
    .from(affiliatePayoutMethods)
    .where(and(eq(affiliatePayoutMethods.affiliateId, affiliateId), eq(affiliatePayoutMethods.status, "active")))
    .orderBy(desc(affiliatePayoutMethods.createdAt))
    .limit(1);
  return row ?? null;
}

/** Public shape of a payout method: never the sealed details. */
export function payoutMethodView(row: PayoutMethodRow | null) {
  if (!row) return null;
  return { id: row.id, type: row.type, displayHint: row.displayHint, payeeType: row.payeeType, residency: row.residency, createdAt: row.createdAt.toISOString() };
}

/** Unseals the transfer details for the operator who records a payment. Never logged or returned by MCP. */
export async function revealPayoutDetails(row: PayoutMethodRow): Promise<Record<string, string>> {
  return JSON.parse(await decryptSecret(row.sealedDetails)) as Record<string, string>;
}

// ------------------------------------------------------------------
// Fees, withholding and eligibility
// ------------------------------------------------------------------

/** Approved withholding rate for this payee class, or null when no rule was approved yet. */
export function withholdingBpsFor(rules: ProgramRules, method: Pick<PayoutMethodRow, "payeeType" | "residency">): number | null {
  if (method.residency === "vn") return method.payeeType === "business" ? rules.withholding.vnBusinessBps : rules.withholding.vnIndividualBps;
  return rules.withholding.otherBps;
}

export function serviceFeeBpsFor(rules: ProgramRules, type: PayoutMethodType): number {
  return type === "paypal" ? rules.paypalServiceFeeBps : rules.bankVnServiceFeeBps;
}

async function isVerified(db: AppDb, affiliateId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: affiliateVerifications.id })
    .from(affiliateVerifications)
    .where(and(eq(affiliateVerifications.affiliateId, affiliateId), eq(affiliateVerifications.status, "verified")))
    .limit(1);
  return Boolean(row);
}

export type PayoutBlocker = "below_threshold" | "payout_method_required" | "withholding_rule_missing" | "verification_required" | "affiliate_suspended";

export interface PayoutPreviewLine {
  affiliateId: string;
  availableMinor: number;
  method: ReturnType<typeof payoutMethodView>;
  serviceFeeBps: number | null;
  withholdingBps: number | null;
  amounts: ReturnType<typeof payoutAmounts> | null;
  blockers: PayoutBlocker[];
}

export interface PayoutPreview {
  period: string;
  currency: string;
  rulesVersion: number;
  thresholdMinor: number;
  lines: PayoutPreviewLine[];
  totals: { payees: number; grossMinor: number; serviceFeeMinor: number; withholdingMinor: number; netMinor: number };
}

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A period can be paid once it has ended (UTC). */
export function assertClosedPeriod(period: unknown, now: Date): string {
  if (typeof period !== "string" || !PERIOD_RE.test(period)) throw referralInvalid("period must be YYYY-MM");
  const current = now.toISOString().slice(0, 7);
  if (period >= current) throw new ReferralError(409, "period_not_closed", "Only closed months can be paid");
  return period;
}

/**
 * What a batch for `period` would pay right now. Commissions are matured first. Each affiliate with
 * an available balance is listed with blockers (threshold, method, approved withholding rule, and
 * identity verification for Vietnamese bank payees).
 */
export async function previewPayouts(db: AppDb, periodInput: unknown, now = new Date()): Promise<PayoutPreview> {
  const period = assertClosedPeriod(periodInput, now);
  await matureConversions(db, now);
  const { version, rules } = await getActiveRules(db);
  const candidates = await db
    .selectDistinct({ affiliateId: commissionLedger.affiliateId })
    .from(commissionLedger)
    .where(sql`${commissionLedger.toBucket} = 'available' or ${commissionLedger.fromBucket} = 'available'`);

  const lines: PayoutPreviewLine[] = [];
  for (const { affiliateId } of candidates) {
    const balances = await affiliateBalances(db, affiliateId);
    if (balances.available <= 0) continue;
    const [affiliate] = await db.select({ status: affiliates.status }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    const method = await activePayoutMethod(db, affiliateId);
    const blockers: PayoutBlocker[] = [];
    if (affiliate?.status !== "active") blockers.push("affiliate_suspended");
    if (balances.available < rules.payoutThresholdMinor) blockers.push("below_threshold");
    let serviceFeeBps: number | null = null;
    let withholdingBps: number | null = null;
    if (!method) blockers.push("payout_method_required");
    else {
      serviceFeeBps = serviceFeeBpsFor(rules, method.type);
      withholdingBps = withholdingBpsFor(rules, method);
      if (withholdingBps === null) blockers.push("withholding_rule_missing");
      if (method.type === "bank_vn" && !(await isVerified(db, affiliateId))) blockers.push("verification_required");
    }
    const amounts = serviceFeeBps !== null && withholdingBps !== null ? payoutAmounts(balances.available, serviceFeeBps, withholdingBps) : null;
    lines.push({ affiliateId, availableMinor: balances.available, method: payoutMethodView(method), serviceFeeBps, withholdingBps, amounts, blockers });
  }
  const payable = lines.filter((line) => line.blockers.length === 0 && line.amounts);
  const totals = payable.reduce(
    (sum, line) => ({
      payees: sum.payees + 1,
      grossMinor: sum.grossMinor + line.amounts!.grossMinor,
      serviceFeeMinor: sum.serviceFeeMinor + line.amounts!.serviceFeeMinor,
      withholdingMinor: sum.withholdingMinor + line.amounts!.withholdingMinor,
      netMinor: sum.netMinor + line.amounts!.netMinor,
    }),
    { payees: 0, grossMinor: 0, serviceFeeMinor: 0, withholdingMinor: 0, netMinor: 0 }
  );
  return { period, currency: rules.currency, rulesVersion: version, thresholdMinor: rules.payoutThresholdMinor, lines, totals };
}

// ------------------------------------------------------------------
// Batch lifecycle
// ------------------------------------------------------------------

export async function getPayoutBatch(db: AppDb, batchId: string): Promise<{ batch: PayoutBatchRow; items: PayoutItemRow[] }> {
  const [batch] = await db.select().from(affiliatePayoutBatches).where(eq(affiliatePayoutBatches.id, batchId)).limit(1);
  if (!batch) throw referralNotFound("Payout batch");
  const items = await db.select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.batchId, batchId));
  return { batch, items };
}

export async function listPayoutBatches(db: AppDb, limit = 24): Promise<PayoutBatchRow[]> {
  return db.select().from(affiliatePayoutBatches).orderBy(desc(affiliatePayoutBatches.period)).limit(limit);
}

/**
 * Creates the batch for a closed period (one per period) and locks each payable line's gross amount:
 * `available -> payout_locked`. The lock is keyed by batch and affiliate, so a retry locks nothing twice.
 */
export async function createPayoutBatch(db: AppDb, periodInput: unknown, actorUserId: string, now = new Date()): Promise<{ batch: PayoutBatchRow; items: PayoutItemRow[] }> {
  const preview = await previewPayouts(db, periodInput, now);
  const payable = preview.lines.filter((line) => line.blockers.length === 0 && line.amounts && line.method);
  if (payable.length === 0) throw new ReferralError(409, "nothing_to_pay", "No affiliate is payable for this period");

  const [batch] = await db
    .insert(affiliatePayoutBatches)
    .values({
      period: preview.period,
      currency: preview.currency,
      rulesVersion: preview.rulesVersion,
      thresholdMinor: preview.thresholdMinor,
      createdBy: actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: affiliatePayoutBatches.period })
    .returning();
  if (!batch) throw new ReferralError(409, "conflict", "A payout batch already exists for this period");

  for (const line of payable) {
    const amounts = line.amounts!;
    const [item] = await db
      .insert(affiliatePayoutItems)
      .values({
        batchId: batch.id,
        affiliateId: line.affiliateId,
        payoutMethodId: line.method!.id,
        methodType: line.method!.type,
        grossMinor: amounts.grossMinor,
        serviceFeeMinor: amounts.serviceFeeMinor,
        withholdingMinor: amounts.withholdingMinor,
        netMinor: amounts.netMinor,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!item) continue;
    await recordLedgerMove(db, {
      affiliateId: line.affiliateId,
      payoutItemId: item.id,
      kind: "payout_lock",
      from: "available",
      to: "payout_locked",
      amountMinor: amounts.grossMinor,
      currency: preview.currency,
      idempotencyKey: `payout_lock:${batch.id}:${line.affiliateId}`,
      actorUserId,
    });
  }
  return getPayoutBatch(db, batch.id);
}

/** Marks a draft batch approved. The route consumes a second operator's approval before calling this. */
export async function approvePayoutBatch(db: AppDb, batchId: string, input: { actorUserId: string; approvalId: string | null }, now = new Date()): Promise<PayoutBatchRow> {
  const [row] = await db
    .update(affiliatePayoutBatches)
    .set({ status: "approved", approvedBy: input.actorUserId, approvalId: input.approvalId, approvedAt: now, updatedAt: now })
    .where(and(eq(affiliatePayoutBatches.id, batchId), eq(affiliatePayoutBatches.status, "draft")))
    .returning();
  if (!row) throw new ReferralError(409, "invalid_transition", "Only draft batches can be approved");
  return row;
}

export interface MarkPaidInput {
  externalReference: unknown;
  payoutCurrency: unknown;
  fxRate?: unknown;
  payoutAmountMinor: unknown;
  providerFeeMinor?: unknown;
}

/**
 * Records one transfer made outside the system. The item moves `pending -> paid` with one guarded
 * update and the external reference is unique, so a retry, a second operator or an agent cannot
 * record the same payout twice.
 */
export async function markPayoutItemPaid(db: AppDb, itemId: string, input: MarkPaidInput, actorUserId: string, now = new Date()): Promise<PayoutItemRow> {
  if (!isAffiliatePayoutsEnabled()) throw new ReferralError(403, "payouts_disabled", "Recording payouts is disabled until the finance review is complete");
  const externalReference = typeof input.externalReference === "string" ? input.externalReference.trim() : "";
  if (!/^[A-Za-z0-9._:/-]{4,120}$/.test(externalReference)) throw referralInvalid("externalReference must be the transfer id from the provider");
  const payoutCurrency = typeof input.payoutCurrency === "string" ? input.payoutCurrency.trim().toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(payoutCurrency)) throw referralInvalid("payoutCurrency must be an ISO code");
  if (!Number.isInteger(input.payoutAmountMinor) || (input.payoutAmountMinor as number) <= 0) throw referralInvalid("payoutAmountMinor must be a positive integer");
  const fxRate = input.fxRate === undefined || input.fxRate === null ? null : String(input.fxRate);
  if (fxRate !== null && !/^\d{1,9}(\.\d{1,9})?$/.test(fxRate)) throw referralInvalid("fxRate must be a decimal string");
  const providerFee = input.providerFeeMinor === undefined || input.providerFeeMinor === null ? null : input.providerFeeMinor;
  if (providerFee !== null && (!Number.isInteger(providerFee) || (providerFee as number) < 0)) throw referralInvalid("providerFeeMinor must be a non-negative integer");

  const [item] = await db.select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.id, itemId)).limit(1);
  if (!item) throw referralNotFound("Payout item");
  const [batch] = await db.select().from(affiliatePayoutBatches).where(eq(affiliatePayoutBatches.id, item.batchId)).limit(1);
  if (batch?.status !== "approved") throw new ReferralError(409, "invalid_transition", "The batch must be approved before recording payments");

  let updated: PayoutItemRow | undefined;
  try {
    [updated] = await db
      .update(affiliatePayoutItems)
      .set({
        status: "paid",
        externalReference,
        payoutCurrency,
        fxRate,
        payoutAmountMinor: input.payoutAmountMinor as number,
        providerFeeMinor: providerFee as number | null,
        paidBy: actorUserId,
        paidAt: now,
        updatedAt: now,
      })
      .where(and(eq(affiliatePayoutItems.id, itemId), eq(affiliatePayoutItems.status, "pending")))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ReferralError(409, "conflict", "That external reference was already recorded");
    }
    throw error;
  }
  if (!updated) throw new ReferralError(409, "invalid_transition", "This payout was already recorded or cancelled");
  await recordLedgerMove(db, {
    affiliateId: item.affiliateId,
    payoutItemId: item.id,
    kind: "payout_paid",
    from: "payout_locked",
    to: "paid",
    amountMinor: item.grossMinor,
    currency: batch.currency,
    idempotencyKey: `payout_paid:${item.id}`,
    actorUserId,
  });
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)` })
    .from(affiliatePayoutItems)
    .where(and(eq(affiliatePayoutItems.batchId, batch.id), eq(affiliatePayoutItems.status, "pending")));
  if (Number(open) === 0) {
    await db
      .update(affiliatePayoutBatches)
      .set({ status: "paid", updatedAt: now })
      .where(and(eq(affiliatePayoutBatches.id, batch.id), eq(affiliatePayoutBatches.status, "approved")));
  }
  return updated;
}

/**
 * Cancels a batch that has no recorded payment yet: unpaid items are cancelled and their locked
 * amounts return to `available` (`payout_unlock`, keyed per item).
 */
export async function cancelPayoutBatch(db: AppDb, batchId: string, actorUserId: string, now = new Date()): Promise<PayoutBatchRow> {
  const { batch, items } = await getPayoutBatch(db, batchId);
  if (items.some((item) => item.status === "paid")) throw new ReferralError(409, "invalid_transition", "A batch with recorded payments cannot be cancelled");
  const [cancelled] = await db
    .update(affiliatePayoutBatches)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(and(eq(affiliatePayoutBatches.id, batchId), inArray(affiliatePayoutBatches.status, ["draft", "approved"])))
    .returning();
  if (!cancelled) throw new ReferralError(409, "invalid_transition", "Only draft or approved batches can be cancelled");
  for (const item of items) {
    const [released] = await db
      .update(affiliatePayoutItems)
      .set({ status: "cancelled", updatedAt: now })
      .where(and(eq(affiliatePayoutItems.id, item.id), eq(affiliatePayoutItems.status, "pending")))
      .returning({ id: affiliatePayoutItems.id });
    if (!released) continue;
    await db.batch([
      ledgerInsert(db, {
        affiliateId: item.affiliateId,
        payoutItemId: item.id,
        kind: "payout_unlock",
        from: "payout_locked",
        to: "available",
        amountMinor: item.grossMinor,
        currency: batch.currency,
        idempotencyKey: `payout_unlock:${item.id}`,
        actorUserId,
      }),
    ]);
  }
  return cancelled;
}

/**
 * Operator adjustment of an affiliate's available balance (positive credit or negative debit), for
 * corrections and recoveries. Requires an approved sensitive action; keyed by that approval.
 */
export async function adjustAffiliateBalance(
  db: AppDb,
  input: { affiliateId: string; amountMinor: unknown; reason: unknown; actorUserId: string; idempotencyKey: string },
): Promise<boolean> {
  const amount = input.amountMinor;
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount as number) > 10_000_000) throw referralInvalid("amountMinor must be a non-zero integer");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 5 || reason.length > 300) throw referralInvalid("reason must be 5-300 characters");
  const [affiliate] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1);
  if (!affiliate) throw referralNotFound("Affiliate");
  const { rules } = await getActiveRules(db);
  const credit = (amount as number) > 0;
  return recordLedgerMove(db, {
    affiliateId: input.affiliateId,
    kind: "adjustment",
    from: credit ? null : "available",
    to: credit ? "available" : null,
    amountMinor: Math.abs(amount as number),
    currency: rules.currency,
    idempotencyKey: input.idempotencyKey,
    actorUserId: input.actorUserId,
    reason,
  });
}
