/**
 * Identity verification (eKYC) of Vietnamese bank payees. A payee starts a check, completes it in the
 * provider's hosted flow, and the provider's signed webhook records the outcome. One verification row
 * per affiliate and provider holds only the provider's applicant reference, the status and decision
 * labels. A Vietnamese bank payout is blocked (`verification_required`) until the status is `verified`,
 * and stays blocked if a later event rejects, resets or deactivates the applicant.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateVerifications, affiliates } from "@/lib/db/schema";
import type { EkycDecision, EkycProvider } from "./ekyc/ekyc-provider";
import { EkycUnavailableError } from "./ekyc/ekyc-provider";
import { activePayoutMethod } from "./affiliate-payouts";
import type { AffiliateRow } from "./affiliates";
import { ReferralError } from "./referral-errors";
import { isAffiliateEkycEnabled } from "./referral-env";

export type VerificationRow = typeof affiliateVerifications.$inferSelect;

/** Member and operator shape: never the provider reference. */
export function verificationView(row: VerificationRow | null) {
  if (!row) return { status: "not_started" as const, provider: null, detail: null, verifiedAt: null, updatedAt: null };
  return {
    status: row.status,
    provider: row.provider,
    detail: row.statusDetail,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findVerification(db: AppDb, affiliateId: string): Promise<VerificationRow | null> {
  const [row] = await db
    .select()
    .from(affiliateVerifications)
    .where(eq(affiliateVerifications.affiliateId, affiliateId))
    .orderBy(sql`${affiliateVerifications.updatedAt} desc`)
    .limit(1);
  return row ?? null;
}

const unavailable = () => new ReferralError(503, "verification_unavailable", "Identity verification is not available yet; Vietnamese bank payouts stay on hold");

/**
 * Starts (or resumes) the payee's check and returns the provider's hosted link. Only an active
 * affiliate whose active payout method is a Vietnamese bank account needs it. A verified payee gets
 * its status without a link; a final rejection is not reopened here (an operator handles it).
 */
export async function startVerification(
  db: AppDb,
  provider: EkycProvider | null,
  affiliate: AffiliateRow,
  input: { locale: "en" | "vi" },
  now = new Date()
): Promise<{ verification: ReturnType<typeof verificationView>; url: string | null }> {
  if (!isAffiliateEkycEnabled() || !provider) throw unavailable();
  if (affiliate.status !== "active") throw new ReferralError(403, "affiliate_suspended", "This affiliate account is suspended");
  const method = await activePayoutMethod(db, affiliate.id);
  if (method?.type !== "bank_vn") throw new ReferralError(409, "verification_not_required", "Identity verification is only needed for Vietnamese bank payouts");

  const existing = await findVerification(db, affiliate.id);
  if (existing?.status === "verified") return { verification: verificationView(existing), url: null };
  if (existing?.status === "rejected") throw new ReferralError(409, "verification_rejected", "Verification was rejected; contact support");

  let started: Awaited<ReturnType<EkycProvider["start"]>>;
  try {
    started = await provider.start({ externalUserId: affiliate.id, locale: input.locale });
  } catch (error) {
    console.error("eKYC start failed", { provider: provider.name, error: error instanceof Error ? error.message : "unknown" });
    if (error instanceof EkycUnavailableError) throw unavailable();
    throw new ReferralError(502, "verification_unavailable", "The verification provider did not respond; retry");
  }
  const [row] = await db
    .insert(affiliateVerifications)
    .values({ affiliateId: affiliate.id, provider: provider.name, providerReference: started.providerReference, status: "pending", createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [affiliateVerifications.affiliateId, affiliateVerifications.provider],
      // A decision recorded meanwhile (e.g. verified by a fast webhook) is kept.
      set: {
        providerReference: started.providerReference,
        status: sql`case when ${affiliateVerifications.status} = 'expired' then 'pending' else ${affiliateVerifications.status} end`,
        updatedAt: sql`max(${affiliateVerifications.updatedAt}, ${now.getTime()})`,
      },
    })
    .returning();
  return { verification: verificationView(row), url: started.url };
}

/**
 * Records a provider decision from a verified webhook. Idempotent and order-safe: an event older than
 * the stored decision changes nothing. An applicant we never started is accepted only when its
 * external id is one of our affiliates (the provider echoes the id we sent).
 */
export async function applyVerificationDecision(db: AppDb, providerName: string, decision: EkycDecision): Promise<VerificationRow | null> {
  const at = decision.occurredAt;
  const set = {
    status: decision.status,
    statusDetail: decision.detail,
    verifiedAt: decision.status === "verified" ? at : null,
    updatedAt: at,
  };
  const [updated] = await db
    .update(affiliateVerifications)
    .set(set)
    .where(
      and(
        eq(affiliateVerifications.provider, providerName),
        eq(affiliateVerifications.providerReference, decision.providerReference),
        lte(affiliateVerifications.updatedAt, at)
      )
    )
    .returning();
  if (updated) return updated;

  const [known] = await db
    .select({ id: affiliateVerifications.id })
    .from(affiliateVerifications)
    .where(and(eq(affiliateVerifications.provider, providerName), eq(affiliateVerifications.providerReference, decision.providerReference)))
    .limit(1);
  if (known || !decision.externalUserId) return null;
  const [affiliate] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, decision.externalUserId)).limit(1);
  if (!affiliate) return null;
  const [inserted] = await db
    .insert(affiliateVerifications)
    .values({ affiliateId: affiliate.id, provider: providerName, providerReference: decision.providerReference, ...set, createdAt: at })
    .onConflictDoNothing()
    .returning();
  return inserted ?? null;
}
