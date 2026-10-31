import { desc } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateProgramRules } from "@/lib/db/schema";
import { BPS } from "./program-math";
import { ReferralError } from "./referral-errors";
import type { ProgramRules } from "./types";

/** Version of the Affiliate Agreement an affiliate accepts (content/policies/affiliate-agreement.ts). */
export const AFFILIATE_TERMS_VERSION = "2026-10-31";

/**
 * Initial defaults from the program proposal; operators publish new versions instead of editing code.
 * VN withholding stays null (no approved rule) until the tax review, which blocks those payouts.
 */
export const DEFAULT_PROGRAM_RULES: ProgramRules = {
  currency: "usd",
  levels: [
    { key: "starter", minCustomers: 0, ordinaryBudgetBps: 1000, memberBudgetBps: 2000 },
    { key: "builder", minCustomers: 5, ordinaryBudgetBps: 1500, memberBudgetBps: 2500 },
    { key: "partner", minCustomers: 20, ordinaryBudgetBps: 2000, memberBudgetBps: 3500 },
    { key: "ambassador", minCustomers: 50, ordinaryBudgetBps: 2500, memberBudgetBps: 4500 },
    { key: "elite", minCustomers: 100, ordinaryBudgetBps: 3000, memberBudgetBps: 5000 },
  ],
  eligiblePlans: ["premium", "vip"],
  attributionWindowDays: 30,
  holdDays: 45,
  payoutThresholdMinor: 2500,
  paypalServiceFeeBps: 2000,
  bankVnServiceFeeBps: 0,
  withholding: { vnIndividualBps: null, vnBusinessBps: null, otherBps: 0 },
  termsVersion: AFFILIATE_TERMS_VERSION,
};

export interface ActiveRules {
  version: number;
  rules: ProgramRules;
}

/** Latest published rules, or the defaults as version 0 when none were published. */
export async function getActiveRules(db: AppDb): Promise<ActiveRules> {
  const [row] = await db.select().from(affiliateProgramRules).orderBy(desc(affiliateProgramRules.version)).limit(1);
  return row ? { version: row.version, rules: row.rules } : { version: 0, rules: DEFAULT_PROGRAM_RULES };
}

const isBps = (value: unknown, max = BPS): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

/** Validates a rules document; throws `invalid_input` naming the first problem. */
export function validateProgramRules(rules: ProgramRules): ProgramRules {
  const fail = (message: string): never => {
    throw new ReferralError(400, "invalid_input", message);
  };
  if (!/^[a-z]{3}$/.test(rules.currency)) fail("currency must be a lowercase ISO code");
  if (!Array.isArray(rules.levels) || rules.levels.length === 0 || rules.levels.length > 10) fail("levels must have 1-10 entries");
  const levels = [...rules.levels].sort((a, b) => a.minCustomers - b.minCustomers);
  if (levels[0].minCustomers !== 0) fail("the first level must start at 0 customers");
  const keys = new Set<string>();
  levels.forEach((level, index) => {
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(level.key) || keys.has(level.key)) fail("level keys must be unique slugs");
    keys.add(level.key);
    if (!Number.isInteger(level.minCustomers) || level.minCustomers < 0) fail("minCustomers must be a non-negative integer");
    if (index > 0 && level.minCustomers === levels[index - 1].minCustomers) fail("levels need distinct thresholds");
    // A budget above 90% would leave the discount denominator near zero and NLB with nothing.
    if (!isBps(level.ordinaryBudgetBps, 9000) || !isBps(level.memberBudgetBps, 9000)) fail("budgets must be 0-9000 bps");
    if (index > 0 && (level.ordinaryBudgetBps < levels[index - 1].ordinaryBudgetBps || level.memberBudgetBps < levels[index - 1].memberBudgetBps)) {
      fail("budgets must not decrease with level");
    }
  });
  if (!Array.isArray(rules.eligiblePlans) || rules.eligiblePlans.some((plan) => plan !== "premium" && plan !== "vip")) fail("eligiblePlans must be premium and/or vip");
  if (!Number.isInteger(rules.attributionWindowDays) || rules.attributionWindowDays < 1 || rules.attributionWindowDays > 90) fail("attributionWindowDays must be 1-90");
  if (!Number.isInteger(rules.holdDays) || rules.holdDays < 30 || rules.holdDays > 180) fail("holdDays must be 30-180 (the refund window is 30 days)");
  if (!Number.isInteger(rules.payoutThresholdMinor) || rules.payoutThresholdMinor < 0) fail("payoutThresholdMinor must be a non-negative integer");
  if (!isBps(rules.paypalServiceFeeBps, 5000) || !isBps(rules.bankVnServiceFeeBps, 5000)) fail("service fees must be 0-5000 bps");
  for (const value of Object.values(rules.withholding ?? {})) if (value !== null && !isBps(value, 5000)) fail("withholding must be null or 0-5000 bps");
  if (!rules.termsVersion?.trim()) fail("termsVersion is required");
  return { ...rules, levels };
}

/** Publishes a new rules version (validated). New checkouts use it; existing snapshots never change. */
export async function publishProgramRules(db: AppDb, input: { rules: ProgramRules; note?: string | null; actorUserId: string }): Promise<ActiveRules> {
  const rules = validateProgramRules(input.rules);
  const { version } = await getActiveRules(db);
  const [row] = await db
    .insert(affiliateProgramRules)
    .values({ version: version + 1, rules, note: input.note ?? null, createdBy: input.actorUserId })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new ReferralError(409, "conflict", "Rules were published concurrently; reload and retry");
  return { version: row.version, rules: row.rules };
}
