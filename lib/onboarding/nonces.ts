import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { onboardingNonces, type OnboardingNonceKind } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "@/lib/crypto/secret-box";

export interface IssueNonceInput {
  kind: OnboardingNonceKind;
  userId: string;
  /** Sealed at rest (for example a PKCE verifier). */
  payload?: Record<string, unknown>;
  ttlMs: number;
}

/** Create a single-use nonce. Only its SHA-256 is stored; the raw value is returned once. */
export async function issueNonce(db: AppDb, input: IssueNonceInput, now: Date = new Date()): Promise<string> {
  const raw = randomToken(32);
  await db.insert(onboardingNonces).values({
    nonceHash: await hashToken(raw),
    kind: input.kind,
    userId: input.userId,
    payloadEnc: input.payload ? await encryptSecret(JSON.stringify(input.payload)) : null,
    expiresAt: new Date(now.getTime() + input.ttlMs),
    createdAt: now,
  });
  return raw;
}

/**
 * Consume a nonce exactly once. One conditional UPDATE marks it used only if it has the right kind,
 * is unused and unexpired, so two concurrent consumers cannot both win. Returns null otherwise.
 */
export async function consumeNonce(
  db: AppDb,
  { kind, raw }: { kind: OnboardingNonceKind; raw: string },
  now: Date = new Date()
): Promise<{ userId: string; payload: Record<string, unknown> | null } | null> {
  if (!raw) return null;
  const [row] = await db
    .update(onboardingNonces)
    .set({ usedAt: now })
    .where(
      and(
        eq(onboardingNonces.nonceHash, await hashToken(raw)),
        eq(onboardingNonces.kind, kind),
        isNull(onboardingNonces.usedAt),
        gt(onboardingNonces.expiresAt, now)
      )
    )
    .returning({ userId: onboardingNonces.userId, payloadEnc: onboardingNonces.payloadEnc });
  if (!row) return null;
  const payload = row.payloadEnc ? (JSON.parse(await decryptSecret(row.payloadEnc)) as Record<string, unknown>) : null;
  return { userId: row.userId, payload };
}

/** Delete nonces that expired more than a day ago (kept briefly for debugging replays). */
export async function purgeExpiredNonces(db: AppDb, now: Date = new Date()): Promise<void> {
  await db.delete(onboardingNonces).where(lt(onboardingNonces.expiresAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
}
