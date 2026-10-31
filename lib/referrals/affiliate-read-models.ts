/**
 * Read models shared by REST, MCP and the account page. Member views never include another person's
 * identity: a conversion is shown by date, plan and amounts, never by buyer name or email.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateConversions, affiliatePayoutItems, affiliatePayoutBatches, commissionLedger, affiliateLinks } from "@/lib/db/schema";
import { tierForProductId } from "@/lib/membership/tiers";
import { affiliateBalances, LEDGER_BUCKETS, type LedgerBalances } from "./commission-ledger";
import { affiliateStanding, type AffiliateRow } from "./affiliates";
import { clickCounts, listLinks, type AffiliateLinkRow } from "./affiliate-links";
import { activePayoutMethod, payoutMethodView } from "./affiliate-payouts";
import { maxCommissionBps } from "./program-math";
import { getActiveRules } from "./program-rules";
import type { ProgramRules } from "./types";

export function programView(version: number, rules: ProgramRules) {
  return {
    rulesVersion: version,
    currency: rules.currency,
    levels: rules.levels,
    eligiblePlans: rules.eligiblePlans,
    attributionWindowDays: rules.attributionWindowDays,
    holdDays: rules.holdDays,
    payoutThresholdMinor: rules.payoutThresholdMinor,
    payoutFees: { paypalServiceFeeBps: rules.paypalServiceFeeBps, bankVnServiceFeeBps: rules.bankVnServiceFeeBps },
    termsVersion: rules.termsVersion,
    invariant: "discountBps*10000 + (10000-discountBps)*commissionBps <= budgetBps*10000",
  };
}

export async function getProgram(db: AppDb) {
  const { version, rules } = await getActiveRules(db);
  return programView(version, rules);
}

export function linkView(link: AffiliateLinkRow, origin: string, budgetBps: number, clicks: number, conversions: number) {
  const url = new URL(`/r/${link.code}`, origin);
  return {
    id: link.id,
    code: link.code,
    url: url.toString(),
    label: link.label,
    discountBps: link.discountBps,
    /** Commission new checkouts get under today's budget (the discount is clamped to the budget). */
    commissionBps: maxCommissionBps(Math.min(link.discountBps, budgetBps), budgetBps),
    destinationPath: link.destinationPath,
    utmCampaign: link.utmCampaign,
    status: link.status,
    version: link.version,
    clicks,
    conversions,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

async function conversionsPerLink(db: AppDb, affiliateId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ linkId: sql<string>`a.link_id`, count: sql<number>`count(*)` })
    .from(sql`${affiliateConversions} c join affiliate_attributions a on a.id = c.attribution_id`)
    .where(sql`c.affiliate_id = ${affiliateId} and c.status != 'reversed'`)
    .groupBy(sql`a.link_id`);
  return new Map(rows.map((row) => [row.linkId, Number(row.count)]));
}

export async function listLinkViews(db: AppDb, affiliate: AffiliateRow, origin: string, now = new Date()) {
  const [links, standing] = await Promise.all([listLinks(db, affiliate.id), affiliateStanding(db, affiliate, now)]);
  const [clicks, conversions] = await Promise.all([clickCounts(db, links.map((link) => link.id)), conversionsPerLink(db, affiliate.id)]);
  return links.map((link) => linkView(link, origin, standing.budgetBps, clicks.get(link.id) ?? 0, conversions.get(link.id) ?? 0));
}

export function getLinkView(db: AppDb, affiliate: AffiliateRow, link: AffiliateLinkRow, origin: string, now = new Date()) {
  return affiliateStanding(db, affiliate, now).then((standing) => linkView(link, origin, standing.budgetBps, 0, 0));
}

export async function affiliateSummary(db: AppDb, affiliate: AffiliateRow, now = new Date()) {
  const [standing, balances, method] = await Promise.all([
    affiliateStanding(db, affiliate, now),
    affiliateBalances(db, affiliate.id),
    activePayoutMethod(db, affiliate.id),
  ]);
  return {
    affiliateId: affiliate.id,
    status: affiliate.status,
    termsVersion: affiliate.termsVersion,
    joinedAt: affiliate.createdAt.toISOString(),
    level: standing.level.key,
    qualifyingCustomers: standing.customers,
    nextLevel: standing.next ? { key: standing.next.level.key, customersNeeded: standing.next.customersNeeded } : null,
    incentiveBasis: standing.basis,
    budgetBps: standing.budgetBps,
    balances: balancesView(balances),
    payoutMethod: payoutMethodView(method),
  };
}

export function balancesView(balances: LedgerBalances) {
  return Object.fromEntries(LEDGER_BUCKETS.map((bucket) => [`${bucket}Minor`, balances[bucket]])) as Record<`${keyof LedgerBalances}Minor`, number>;
}

export async function listConversions(db: AppDb, affiliateId: string, limit = 50) {
  const rows = await db
    .select()
    .from(affiliateConversions)
    .where(eq(affiliateConversions.affiliateId, affiliateId))
    .orderBy(desc(affiliateConversions.paidAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    plan: tierForProductId(row.polarProductId),
    currency: row.currency,
    netMinor: row.netMinor,
    discountMinor: row.discountMinor,
    commissionBps: row.commissionBps,
    commissionMinor: row.commissionMinor,
    refundedNetMinor: row.refundedNetMinor,
    status: row.status,
    paidAt: row.paidAt.toISOString(),
    maturesAt: row.maturesAt.toISOString(),
  }));
}

export async function listLedger(db: AppDb, affiliateId: string, limit = 100) {
  const rows = await db
    .select()
    .from(commissionLedger)
    .where(eq(commissionLedger.affiliateId, affiliateId))
    .orderBy(desc(commissionLedger.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    from: row.fromBucket,
    to: row.toBucket,
    amountMinor: row.amountMinor,
    currency: row.currency,
    conversionId: row.conversionId,
    payoutItemId: row.payoutItemId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listAffiliatePayouts(db: AppDb, affiliateId: string) {
  const rows = await db
    .select({ item: affiliatePayoutItems, period: affiliatePayoutBatches.period, batchStatus: affiliatePayoutBatches.status })
    .from(affiliatePayoutItems)
    .innerJoin(affiliatePayoutBatches, eq(affiliatePayoutBatches.id, affiliatePayoutItems.batchId))
    .where(eq(affiliatePayoutItems.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayoutBatches.period));
  return rows.map(({ item, period, batchStatus }) => payoutItemView(item, period, batchStatus));
}

export function payoutItemView(item: typeof affiliatePayoutItems.$inferSelect, period?: string, batchStatus?: string) {
  return {
    id: item.id,
    batchId: item.batchId,
    period,
    batchStatus,
    affiliateId: item.affiliateId,
    methodType: item.methodType,
    grossMinor: item.grossMinor,
    serviceFeeMinor: item.serviceFeeMinor,
    withholdingMinor: item.withholdingMinor,
    netMinor: item.netMinor,
    status: item.status,
    payoutCurrency: item.payoutCurrency,
    fxRate: item.fxRate,
    payoutAmountMinor: item.payoutAmountMinor,
    providerFeeMinor: item.providerFeeMinor,
    externalReference: item.externalReference,
    paidAt: item.paidAt?.toISOString() ?? null,
  };
}

/**
 * Ledger-to-provider reconciliation: per conversion, the provider order amounts next to the ledger
 * (accrued, reversed and where the rest sits), plus program-wide checks that must all hold:
 * - every conversion's ledger accrual equals its commission;
 * - reversals never exceed the commission;
 * - the `paid` bucket equals the sum of payout items recorded as paid;
 * - the `payout_locked` bucket equals the sum of pending payout items.
 */
export async function reconciliationReport(db: AppDb, input: { since?: Date; until?: Date } = {}) {
  const conditions = [
    input.since ? sql`${affiliateConversions.paidAt} >= ${input.since.getTime()}` : undefined,
    input.until ? sql`${affiliateConversions.paidAt} < ${input.until.getTime()}` : undefined,
  ].filter(Boolean);
  const conversions = await db
    .select({
      conversion: affiliateConversions,
      accrued: sql<number>`coalesce((select sum(amount_minor) from commission_ledger l where l.conversion_id = affiliate_conversions.id and l.kind = 'accrual'), 0)`,
      reversed: sql<number>`coalesce((select sum(amount_minor) from commission_ledger l where l.conversion_id = affiliate_conversions.id and l.kind = 'reversal'), 0)`,
    })
    .from(affiliateConversions)
    .where(conditions.length ? and(...(conditions as ReturnType<typeof sql>[])) : undefined)
    .orderBy(desc(affiliateConversions.paidAt))
    .limit(1000);

  const lines = conversions.map(({ conversion, accrued, reversed }) => {
    const issues: string[] = [];
    if (Number(accrued) !== conversion.commissionMinor) issues.push("accrual_mismatch");
    if (Number(reversed) > conversion.commissionMinor) issues.push("over_reversed");
    if (conversion.status === "held") issues.push(`held:${conversion.holdReason ?? "review"}`);
    return {
      conversionId: conversion.id,
      affiliateId: conversion.affiliateId,
      polarOrderId: conversion.polarOrderId,
      currency: conversion.currency,
      subtotalMinor: conversion.subtotalMinor,
      discountMinor: conversion.discountMinor,
      netMinor: conversion.netMinor,
      taxMinor: conversion.taxMinor,
      refundedNetMinor: conversion.refundedNetMinor,
      commissionMinor: conversion.commissionMinor,
      accruedMinor: Number(accrued),
      reversedMinor: Number(reversed),
      status: conversion.status,
      issues,
    };
  });

  const bucketRows = await db
    .select({ bucket: sql<string>`bucket`, total: sql<number>`sum(delta)` })
    .from(
      sql`(select to_bucket as bucket, amount_minor as delta from commission_ledger where to_bucket is not null
          union all select from_bucket as bucket, -amount_minor as delta from commission_ledger where from_bucket is not null)`
    )
    .groupBy(sql`bucket`);
  const buckets = Object.fromEntries(LEDGER_BUCKETS.map((bucket) => [bucket, 0])) as Record<string, number>;
  for (const row of bucketRows) buckets[row.bucket] = Number(row.total) || 0;
  const [items] = await db
    .select({
      paid: sql<number>`coalesce(sum(case when status = 'paid' then gross_minor end), 0)`,
      locked: sql<number>`coalesce(sum(case when status = 'pending' then gross_minor end), 0)`,
    })
    .from(affiliatePayoutItems);
  const checks = {
    paidMatchesItems: buckets.paid === Number(items?.paid ?? 0),
    lockedMatchesItems: buckets.payout_locked === Number(items?.locked ?? 0),
    conversionsBalanced: lines.every((line) => !line.issues.some((issue) => issue === "accrual_mismatch" || issue === "over_reversed")),
  };
  return { generatedAt: new Date().toISOString(), buckets, payoutItems: { paidMinor: Number(items?.paid ?? 0), lockedMinor: Number(items?.locked ?? 0) }, checks, conversions: lines };
}

/** Link owned by the affiliate, for member routes. */
export async function findOwnLink(db: AppDb, affiliateId: string, linkId: string): Promise<AffiliateLinkRow | null> {
  const [row] = await db.select().from(affiliateLinks).where(and(eq(affiliateLinks.id, linkId), eq(affiliateLinks.affiliateId, affiliateId))).limit(1);
  return row ?? null;
}
