/**
 * Personal share links for the Year in Review (and the passport). The raw token is shown once to the
 * member and lives only in the shared URL; D1 stores its sha256, so a database read never reveals a
 * working link. Revoking sets `revoked_at`; a revoked token resolves to nothing.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import type { AppDb } from "@/lib/db";
import { builderShareLinks } from "@/lib/db/schema";
import { BuilderApiError } from "./http";

export type ShareLink = typeof builderShareLinks.$inferSelect;
export type ShareKind = ShareLink["kind"];

/** Active links per member, year and kind; keeps a leaked-link cleanup manageable. */
export const MAX_ACTIVE_LINKS = 5;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isShareTokenShape(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** Creates a link and returns the raw token once; only its hash is stored. */
export async function createShareLink(
  db: AppDb,
  input: { userId: string; kind: ShareKind; year: number | null }
): Promise<{ link: ShareLink; token: string }> {
  const active = await listShareLinks(db, input.userId, { kind: input.kind, year: input.year, activeOnly: true });
  if (active.length >= MAX_ACTIVE_LINKS) {
    throw new BuilderApiError(409, "too_many_links", `Revoke a link first: at most ${MAX_ACTIVE_LINKS} active links.`);
  }
  const token = randomBytes(32).toString("base64url");
  const [link] = await db
    .insert(builderShareLinks)
    .values({ tokenHash: hashShareToken(token), userId: input.userId, kind: input.kind, year: input.year })
    .returning();
  return { link, token };
}

export async function listShareLinks(
  db: AppDb,
  userId: string,
  filter: { kind?: ShareKind; year?: number | null; activeOnly?: boolean } = {}
): Promise<ShareLink[]> {
  const conditions = [eq(builderShareLinks.userId, userId)];
  if (filter.kind) conditions.push(eq(builderShareLinks.kind, filter.kind));
  if (typeof filter.year === "number") conditions.push(eq(builderShareLinks.year, filter.year));
  if (filter.activeOnly) conditions.push(isNull(builderShareLinks.revokedAt));
  return db.select().from(builderShareLinks).where(and(...conditions)).orderBy(desc(builderShareLinks.createdAt));
}

/**
 * Idempotent: revoking an already revoked link returns it unchanged. Only the owner may revoke. With
 * `expected.year`, a link of another year is reported as not found and left untouched.
 */
export async function revokeShareLink(
  db: AppDb,
  userId: string,
  linkId: string,
  now = new Date(),
  expected: { year?: number } = {}
): Promise<ShareLink> {
  const [link] = await db
    .select()
    .from(builderShareLinks)
    .where(and(eq(builderShareLinks.id, linkId), eq(builderShareLinks.userId, userId)))
    .limit(1);
  if (!link || (expected.year !== undefined && link.year !== expected.year)) {
    throw new BuilderApiError(404, "link_not_found", "Share link not found.");
  }
  if (link.revokedAt) return link;
  const [updated] = await db
    .update(builderShareLinks)
    .set({ revokedAt: now })
    .where(and(eq(builderShareLinks.id, linkId), isNull(builderShareLinks.revokedAt)))
    .returning();
  return updated ?? link;
}

/** The active link behind a raw token, or null when unknown, malformed or revoked. */
export async function resolveShareToken(db: AppDb, token: string, expected?: { kind: ShareKind; year?: number }): Promise<ShareLink | null> {
  if (!isShareTokenShape(token)) return null;
  const [link] = await db.select().from(builderShareLinks).where(eq(builderShareLinks.tokenHash, hashShareToken(token))).limit(1);
  if (!link || link.revokedAt) return null;
  if (expected && (link.kind !== expected.kind || (expected.year !== undefined && link.year !== expected.year))) return null;
  return link;
}

/** API-safe view of a link: never the hash. */
export function serializeShareLink(link: ShareLink) {
  return {
    id: link.id,
    kind: link.kind,
    year: link.year,
    createdAt: link.createdAt.toISOString(),
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
  };
}
