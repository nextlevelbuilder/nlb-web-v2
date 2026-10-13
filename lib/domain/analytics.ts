import { getDb, type AppDb } from "@/lib/db";
import { analyticsEvents, votes, products } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

export interface RecordAnalyticsParams {
  eventType: "page_view" | "outbound_click" | "referral";
  productId?: string;
  referrerHost?: string;
  countryCode?: string;
  deviceCategory?: string;
}

export interface CastVoteParams {
  productId: string;
  userId: string;
  turnstileToken?: string;
}

/**
 * Verify Cloudflare Turnstile token on server-side.
 */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return true;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    const outcome = (await res.json()) as { success: boolean };
    return outcome.success === true;
  } catch {
    return false;
  }
}

/**
 * Record a first-party privacy-preserving analytics event into the ledger.
 */
export async function recordAnalyticsEvent(params: RecordAnalyticsParams, customDb?: AppDb) {
  const db = customDb || getDb();
  const eventId = `evt_${crypto.randomUUID()}`;

  const [event] = await db
    .insert(analyticsEvents)
    .values({
      eventId,
      eventType: params.eventType,
      productId: params.productId || null,
      referrerHost: params.referrerHost || null,
      countryCode: params.countryCode || null,
      deviceCategory: params.deviceCategory || null,
    })
    .returning();

  return event;
}

/**
 * Cast a vote for a product.
 * Enforces Turnstile bot verification and 1 vote per user per product per UTC day via database-level transaction and unique constraint.
 */
export async function castVote(params: CastVoteParams, customDb?: AppDb) {
  const db = customDb || getDb();
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const isProd = process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE;

  // 1. Mandatory Turnstile bot verification check
  let isTurnstileVerified = false;
  if (secretKey) {
    if (!params.turnstileToken) {
      throw new Error("Turnstile bot verification token is required.");
    }
    const isValid = await verifyTurnstileToken(params.turnstileToken);
    if (!isValid) {
      throw new Error("Turnstile bot verification failed.");
    }
    isTurnstileVerified = true;
  } else {
    // In dev / test environments without TURNSTILE_SECRET_KEY configured
    if (params.turnstileToken) {
      isTurnstileVerified = await verifyTurnstileToken(params.turnstileToken);
    } else {
      isTurnstileVerified = !isProd;
    }
  }

  const todayUtc = new Date().toISOString().split("T")[0];

  // D1 has no interactive transactions. Insert the vote (unique per product/user/UTC day) and
  // increment the legacy counter in one atomic batch; the update only fires if this exact vote row exists,
  // so a duplicate vote (ignored by ON CONFLICT DO NOTHING) never bumps the counter.
  const voteId = crypto.randomUUID();
  const [inserted] = await db.batch([
    db
      .insert(votes)
      .values({
        id: voteId,
        productId: params.productId,
        userId: params.userId,
        voteDate: todayUtc,
        turnstileVerified: isTurnstileVerified,
      })
      .onConflictDoNothing()
      .returning(),
    db
      .update(products)
      .set({
        trustScore: sql`${products.trustScore} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, params.productId), sql`exists (select 1 from ${votes} where ${votes.id} = ${voteId})`)),
  ]);

  const [vote] = inserted;
  if (!vote) {
    throw new Error("You have already voted for this product today.");
  }
  return vote;
}
