import { and, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateLinkClicks, affiliateLinks } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/membership/member-access";
import { affiliateStanding, type AffiliateRow } from "./affiliates";
import { maxCommissionBps } from "./program-math";
import { ReferralError, referralInvalid, referralNotFound } from "./referral-errors";
import type { AffiliateLinkStatus } from "./types";

export type AffiliateLinkRow = typeof affiliateLinks.$inferSelect;

export const MAX_LINKS_PER_AFFILIATE = 20;
const CODE_RE = /^[a-z0-9](?:[a-z0-9-]{2,30})[a-z0-9]$/;
const RESERVED_CODES = new Set(["admin", "api", "nlb", "nextlevelbuilder", "support", "official", "staff", "test"]);
/** First path segment a link may land on (after an optional `/vi`); "" is the home page. */
const DESTINATION_SEGMENTS = new Set(["", "courses", "live", "blog", "affiliates"]);
const UTM_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function normalizeCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code) && !code.includes("--") && !RESERVED_CODES.has(code);
}

/**
 * Same-origin landing path from the allowlist: `/`, `/vi`, `/courses…`, `/live…`, `/blog…`,
 * `/affiliates…`, optionally with `#pricing`-style fragments. Anything else (protocols, `//host`,
 * queries, other sections) is refused so links cannot become open redirects.
 */
export function normalizeDestination(value: unknown): string {
  if (value === undefined || value === null || value === "") return "/";
  if (typeof value !== "string" || value.length > 200) throw referralInvalid("destinationPath is invalid");
  const [path, fragment] = value.split("#", 2);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("\\") || path.includes("..")) {
    throw referralInvalid("destinationPath must be a site path");
  }
  if (fragment !== undefined && !/^[a-z0-9-]{1,40}$/.test(fragment)) throw referralInvalid("destinationPath fragment is invalid");
  const segments = path.split("/").filter(Boolean);
  const rest = segments[0] === "vi" ? segments.slice(1) : segments;
  if (!DESTINATION_SEGMENTS.has(rest[0] ?? "") || rest.some((segment) => !/^[a-z0-9-]{1,80}$/.test(segment))) {
    throw referralInvalid("destinationPath is not an allowed landing page");
  }
  return value;
}

function normalizeUtm(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UTM_RE.test(value.trim().toLowerCase())) throw referralInvalid("utmCampaign must be a short slug");
  return value.trim().toLowerCase();
}

function normalizeLabel(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 80) throw referralInvalid("label must be at most 80 characters");
  return value.trim();
}

function parseDiscountBps(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 9000) throw referralInvalid("discountBps must be an integer 0-9000");
  return value as number;
}

/**
 * Refuses a discount above the affiliate's current budget, so an over-budget pair can never be
 * stored. Returns the commission the remaining budget allows, for the response preview.
 */
async function assertDiscountWithinBudget(db: AppDb, affiliate: AffiliateRow, discountBps: number, now: Date): Promise<number> {
  const standing = await affiliateStanding(db, affiliate, now);
  if (discountBps > standing.budgetBps) {
    throw new ReferralError(422, "over_budget", `The buyer discount cannot exceed your incentive budget of ${standing.budgetBps / 100}%`);
  }
  return maxCommissionBps(discountBps, standing.budgetBps);
}

function randomCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export interface LinkInput {
  code?: unknown;
  label?: unknown;
  discountBps?: unknown;
  destinationPath?: unknown;
  utmCampaign?: unknown;
  status?: unknown;
  /** Optional optimistic-concurrency guard: the `version` the caller last read. */
  expectedVersion?: unknown;
}

export async function listLinks(db: AppDb, affiliateId: string): Promise<AffiliateLinkRow[]> {
  return db.select().from(affiliateLinks).where(eq(affiliateLinks.affiliateId, affiliateId)).orderBy(desc(affiliateLinks.createdAt));
}

export async function createLink(db: AppDb, affiliate: AffiliateRow, input: LinkInput, now = new Date()): Promise<AffiliateLinkRow> {
  const requested = input.code === undefined || input.code === null || input.code === "" ? null : normalizeCode(input.code);
  if (requested !== null && !isValidCode(requested)) throw referralInvalid("code must be 4-32 lowercase letters, digits or single hyphens");
  const discountBps = parseDiscountBps(input.discountBps);
  const values = {
    affiliateId: affiliate.id,
    label: normalizeLabel(input.label),
    discountBps,
    destinationPath: normalizeDestination(input.destinationPath),
    utmCampaign: normalizeUtm(input.utmCampaign),
    createdAt: now,
    updatedAt: now,
  };
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(affiliateLinks).where(eq(affiliateLinks.affiliateId, affiliate.id));
  if (Number(count) >= MAX_LINKS_PER_AFFILIATE) throw new ReferralError(409, "link_limit_reached", `At most ${MAX_LINKS_PER_AFFILIATE} links per affiliate`);
  await assertDiscountWithinBudget(db, affiliate, discountBps, now);

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = requested ?? randomCode();
    try {
      const [row] = await db.insert(affiliateLinks).values({ ...values, code }).returning();
      return row;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (requested !== null) throw new ReferralError(409, "code_taken", "That code is already taken");
    }
  }
  throw new ReferralError(409, "conflict", "Could not allocate a link code; retry");
}

const LINK_STATUSES: readonly AffiliateLinkStatus[] = ["active", "paused", "archived"];

/** Edits a link. The code is stable; every edit bumps `version`, which new checkouts record. */
export async function updateLink(db: AppDb, affiliate: AffiliateRow, linkId: string, input: LinkInput, now = new Date()): Promise<AffiliateLinkRow> {
  const [link] = await db
    .select()
    .from(affiliateLinks)
    .where(and(eq(affiliateLinks.id, linkId), eq(affiliateLinks.affiliateId, affiliate.id)))
    .limit(1);
  if (!link) throw referralNotFound("Link");
  if (input.code !== undefined && normalizeCode(input.code) !== link.code) throw referralInvalid("code cannot be changed; create a new link");
  if (link.status === "archived") throw new ReferralError(409, "invalid_transition", "Archived links cannot be edited");
  if (input.expectedVersion !== undefined && input.expectedVersion !== link.version) {
    throw new ReferralError(409, "conflict", "The link changed meanwhile; reload and retry");
  }

  const patch: Partial<typeof affiliateLinks.$inferInsert> = {};
  if (input.label !== undefined) patch.label = normalizeLabel(input.label);
  if (input.destinationPath !== undefined) patch.destinationPath = normalizeDestination(input.destinationPath);
  if (input.utmCampaign !== undefined) patch.utmCampaign = normalizeUtm(input.utmCampaign);
  if (input.status !== undefined) {
    if (!LINK_STATUSES.includes(input.status as AffiliateLinkStatus)) throw referralInvalid("status must be active, paused or archived");
    patch.status = input.status as AffiliateLinkStatus;
  }
  if (input.discountBps !== undefined) {
    patch.discountBps = parseDiscountBps(input.discountBps);
    await assertDiscountWithinBudget(db, affiliate, patch.discountBps, now);
  }
  if (Object.keys(patch).length === 0) return link;

  // Guarded by the version read above, so two concurrent edits cannot silently overwrite each other.
  const [updated] = await db
    .update(affiliateLinks)
    .set({ ...patch, version: link.version + 1, updatedAt: now })
    .where(and(eq(affiliateLinks.id, link.id), eq(affiliateLinks.version, link.version)))
    .returning();
  if (!updated) throw new ReferralError(409, "conflict", "The link changed meanwhile; reload and retry");
  return updated;
}

export async function findActiveLinkByCode(db: AppDb, code: string): Promise<AffiliateLinkRow | null> {
  const normalized = normalizeCode(code);
  if (!isValidCode(normalized)) return null;
  const [row] = await db
    .select()
    .from(affiliateLinks)
    .where(and(eq(affiliateLinks.code, normalized), eq(affiliateLinks.status, "active")))
    .limit(1);
  return row ?? null;
}

/** Counts a unique visitor per link and UTC day; repeats the same day are ignored. */
export async function recordLinkClick(db: AppDb, linkId: string, visitorHash: string, now = new Date()): Promise<void> {
  await db
    .insert(affiliateLinkClicks)
    .values({ linkId, day: now.toISOString().slice(0, 10), visitorHash, createdAt: now })
    .onConflictDoNothing();
}

export async function clickCounts(db: AppDb, linkIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (linkIds.length === 0) return counts;
  const rows = await db
    .select({ linkId: affiliateLinkClicks.linkId, count: sql<number>`count(*)` })
    .from(affiliateLinkClicks)
    .where(sql`${affiliateLinkClicks.linkId} in ${linkIds}`)
    .groupBy(affiliateLinkClicks.linkId);
  for (const row of rows) counts.set(row.linkId, Number(row.count));
  return counts;
}
