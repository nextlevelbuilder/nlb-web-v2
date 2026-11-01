/**
 * Affiliate tax documents: a yearly withholding statement per affiliate, built from recorded (paid)
 * payout items only. Each line carries the gross commission paid, the NLB service fee, the tax withheld
 * and the rates applied, as snapshot on the item from the rules version of its batch. Withholding comes
 * only from published, reviewed rules: while the Vietnamese rates are `null` no Vietnamese payee is
 * paid, so no statement can show an unapproved rate.
 *
 * The statement is the data source for the official withholding certificate that finance issues
 * through its registered e-invoice system; it is not itself that certificate. Paid items never change,
 * so a statement for a closed year is stable and its document number is deterministic.
 */
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliatePayoutBatches, affiliatePayoutItems, affiliatePayoutMethods } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import { ok } from "@/lib/builder-league/http";
import { getActiveRules } from "./program-rules";
import { referralInvalid } from "./referral-errors";
import type { PayeeResidency, PayeeType, PayoutMethodType } from "./types";

/** Tax years follow Vietnam time (UTC+7), where NLB withholds and reports. */
const TAX_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

export function taxYearRange(year: number): { from: Date; to: Date } {
  return { from: new Date(Date.UTC(year, 0, 1) - TAX_TZ_OFFSET_MS), to: new Date(Date.UTC(year + 1, 0, 1) - TAX_TZ_OFFSET_MS) };
}

export function parseTaxYear(value: string | null, now = new Date()): number {
  const currentYear = new Date(now.getTime() + TAX_TZ_OFFSET_MS).getUTCFullYear();
  if (value === null || value.trim() === "") return currentYear;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2026 || year > currentYear) throw referralInvalid(`year must be between 2026 and ${currentYear}`);
  return year;
}

export interface TaxStatementLine {
  payoutItemId: string;
  period: string;
  paidAt: string;
  methodType: PayoutMethodType;
  payeeType: PayeeType | null;
  residency: PayeeResidency | null;
  grossMinor: number;
  serviceFeeBps: number | null;
  serviceFeeMinor: number;
  withholdingBps: number | null;
  withholdingMinor: number;
  netMinor: number;
  payoutCurrency: string | null;
  fxRate: string | null;
  payoutAmountMinor: number | null;
  externalReference: string | null;
}

export interface TaxStatement {
  kind: "withholding_statement";
  documentNumber: string;
  affiliateId: string;
  year: number;
  currency: string;
  /** True once the tax year has ended (Vietnam time); a running year can still gain lines. */
  final: boolean;
  generatedAt: string;
  lines: TaxStatementLine[];
  totals: { payouts: number; grossMinor: number; serviceFeeMinor: number; withholdingMinor: number; netMinor: number };
}

export function taxDocumentNumber(affiliateId: string, year: number): string {
  return `NLB-AFF-WHT-${year}-${affiliateId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/** The affiliate's withholding statement for one tax year (paid payouts only, oldest first). */
export async function taxStatement(db: AppDb, affiliateId: string, year: number, currency: string, now = new Date()): Promise<TaxStatement> {
  const { from, to } = taxYearRange(year);
  const rows = await db
    .select({ item: affiliatePayoutItems, period: affiliatePayoutBatches.period, payeeType: affiliatePayoutMethods.payeeType, residency: affiliatePayoutMethods.residency })
    .from(affiliatePayoutItems)
    .innerJoin(affiliatePayoutBatches, eq(affiliatePayoutBatches.id, affiliatePayoutItems.batchId))
    .leftJoin(affiliatePayoutMethods, eq(affiliatePayoutMethods.id, affiliatePayoutItems.payoutMethodId))
    .where(
      and(
        eq(affiliatePayoutItems.affiliateId, affiliateId),
        eq(affiliatePayoutItems.status, "paid"),
        gte(affiliatePayoutItems.paidAt, from),
        lt(affiliatePayoutItems.paidAt, to)
      )
    )
    .orderBy(asc(affiliatePayoutItems.paidAt), asc(affiliatePayoutItems.id));
  const lines: TaxStatementLine[] = rows.map(({ item, period, payeeType, residency }) => ({
    payoutItemId: item.id,
    period,
    paidAt: item.paidAt!.toISOString(),
    methodType: item.methodType,
    payeeType: payeeType ?? null,
    residency: residency ?? null,
    grossMinor: item.grossMinor,
    serviceFeeBps: item.serviceFeeBps,
    serviceFeeMinor: item.serviceFeeMinor,
    withholdingBps: item.withholdingBps,
    withholdingMinor: item.withholdingMinor,
    netMinor: item.netMinor,
    payoutCurrency: item.payoutCurrency,
    fxRate: item.fxRate,
    payoutAmountMinor: item.payoutAmountMinor,
    externalReference: item.externalReference,
  }));
  const totals = lines.reduce(
    (sum, line) => ({
      payouts: sum.payouts + 1,
      grossMinor: sum.grossMinor + line.grossMinor,
      serviceFeeMinor: sum.serviceFeeMinor + line.serviceFeeMinor,
      withholdingMinor: sum.withholdingMinor + line.withholdingMinor,
      netMinor: sum.netMinor + line.netMinor,
    }),
    { payouts: 0, grossMinor: 0, serviceFeeMinor: 0, withholdingMinor: 0, netMinor: 0 }
  );
  return {
    kind: "withholding_statement",
    documentNumber: taxDocumentNumber(affiliateId, year),
    affiliateId,
    year,
    currency,
    final: now.getTime() >= to.getTime(),
    generatedAt: now.toISOString(),
    lines,
    totals,
  };
}

const CSV_COLUMNS: Array<keyof TaxStatementLine> = [
  "payoutItemId",
  "period",
  "paidAt",
  "methodType",
  "payeeType",
  "residency",
  "grossMinor",
  "serviceFeeBps",
  "serviceFeeMinor",
  "withholdingBps",
  "withholdingMinor",
  "netMinor",
  "payoutCurrency",
  "fxRate",
  "payoutAmountMinor",
  "externalReference",
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote anything with separators; prefix formula-looking cells so spreadsheets never evaluate them.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV rendering for finance and spreadsheet import (one header row, one row per payout, then totals). */
export function taxStatementCsv(statement: TaxStatement): string {
  const rows = [
    [`# ${statement.documentNumber}`, `year=${statement.year}`, `currency=${statement.currency}`, `final=${statement.final}`].map(csvCell).join(","),
    CSV_COLUMNS.join(","),
    ...statement.lines.map((line) => CSV_COLUMNS.map((column) => csvCell(line[column])).join(",")),
    ["total", "", "", "", "", "", statement.totals.grossMinor, "", statement.totals.serviceFeeMinor, "", statement.totals.withholdingMinor, statement.totals.netMinor, "", "", "", ""]
      .map(csvCell)
      .join(","),
  ];
  return `${rows.join("\r\n")}\r\n`;
}

/**
 * The HTTP rendering shared by the member and operator routes: `?year=` (default: the current tax
 * year) and `?format=json|csv` (default json, in the usual `{ data }` envelope).
 */
export async function taxStatementResponse(db: AppDb, affiliateId: string, url: URL, now = new Date()): Promise<Response> {
  const year = parseTaxYear(url.searchParams.get("year"), now);
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") throw referralInvalid("format must be json or csv");
  const { rules } = await getActiveRules(db);
  const statement = await taxStatement(db, affiliateId, year, rules.currency, now);
  if (format === "json") return ok(statement);
  return new NextResponse(taxStatementCsv(statement), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${statement.documentNumber}.csv"`,
      "cache-control": "no-store",
    },
  });
}
