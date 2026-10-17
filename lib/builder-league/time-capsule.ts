/**
 * Builder Time Capsule: a yearly starting intent and an end-of-year reflection.
 *
 * - Entries are versioned: an edit appends version n+1, earlier versions stay readable by the owner.
 * - Visibility is per entry (the latest version decides): private (owner only), community (league
 *   members) or public. Default private.
 * - Concurrent saves collide on unique(user, year, kind, version); the loser retries with the next
 *   version, so no edit is lost.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { timeCapsuleEntries } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { localYear } from "./time-windows";
import { VISIBILITIES, type Visibility } from "./types";

export type TimeCapsuleEntry = typeof timeCapsuleEntries.$inferSelect;
export const CAPSULE_KINDS = ["intent", "reflection"] as const;
export type CapsuleKind = (typeof CAPSULE_KINDS)[number];
export const CAPSULE_BODY_MAX = 4000;
const MAX_SAVE_ATTEMPTS = 5;

export const capsuleInputSchema = z
  .object({
    year: z.number().int().min(2000).max(2100).optional(),
    kind: z.enum(CAPSULE_KINDS),
    body: z.string().trim().min(1).max(CAPSULE_BODY_MAX),
    visibility: z.enum(VISIBILITIES).default("private"),
  })
  .strict();
export type CapsuleInput = z.input<typeof capsuleInputSchema>;

/** Years open for writing: last year (late reflections), this year and next year (early intents). */
export function writableYears(now: Date = new Date()): number[] {
  const year = localYear(now);
  return [year - 1, year, year + 1];
}

function isUniqueViolation(err: unknown): boolean {
  for (let current: unknown = err, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error && /UNIQUE constraint failed/i.test(current.message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

/** Appends a new version of the member's intent or reflection for a year. */
export async function saveCapsuleEntry(db: AppDb, userId: string, input: CapsuleInput, now: Date = new Date()): Promise<TimeCapsuleEntry> {
  const value = capsuleInputSchema.parse(input);
  const year = value.year ?? localYear(now);
  if (!writableYears(now).includes(year)) {
    throw new BuilderApiError(400, "year_closed", "You can write for last year, this year or next year.");
  }
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    const [latest] = await db
      .select()
      .from(timeCapsuleEntries)
      .where(and(eq(timeCapsuleEntries.userId, userId), eq(timeCapsuleEntries.year, year), eq(timeCapsuleEntries.kind, value.kind)))
      .orderBy(desc(timeCapsuleEntries.version))
      .limit(1);
    // An unchanged resubmission (double click, retry) does not create a version.
    if (latest && latest.body === value.body && latest.visibility === value.visibility) return latest;
    try {
      const [row] = await db
        .insert(timeCapsuleEntries)
        .values({
          id: crypto.randomUUID(),
          userId,
          year,
          kind: value.kind,
          body: value.body,
          visibility: value.visibility,
          version: (latest?.version ?? 0) + 1,
          createdAt: now,
        })
        .returning();
      return row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new BuilderApiError(409, "capsule_contention", "Your capsule was saved from somewhere else at the same time. Reload and try again.");
}

export interface CapsuleYear {
  year: number;
  intent: TimeCapsuleEntry | null;
  reflection: TimeCapsuleEntry | null;
  /** Every version, oldest first (owner only). */
  history: TimeCapsuleEntry[];
}

/** The owner's view of a year: latest intent and reflection plus the full version history. */
export async function getCapsuleYear(db: AppDb, userId: string, year: number): Promise<CapsuleYear> {
  const rows = await db
    .select()
    .from(timeCapsuleEntries)
    .where(and(eq(timeCapsuleEntries.userId, userId), eq(timeCapsuleEntries.year, year)))
    .orderBy(asc(timeCapsuleEntries.kind), asc(timeCapsuleEntries.version));
  const latest = (kind: CapsuleKind) => rows.filter((row) => row.kind === kind).at(-1) ?? null;
  return { year, intent: latest("intent"), reflection: latest("reflection"), history: rows };
}

export interface CapsuleViewer {
  userId: string | null;
  /** True when the viewer may use the Builder League (community visibility). */
  isLeagueMember: boolean;
}

export function canSeeCapsuleEntry(visibility: Visibility, ownerId: string, viewer: CapsuleViewer): boolean {
  if (viewer.userId === ownerId) return true;
  if (visibility === "public") return true;
  return visibility === "community" && viewer.isLeagueMember;
}

/**
 * Latest intent and reflection of `ownerId` for `year` that `viewer` may see. History is never exposed
 * to other people, and a hidden latest version hides the entry even if an older version was public.
 */
export async function getVisibleCapsuleEntries(
  db: AppDb,
  ownerId: string,
  year: number,
  viewer: CapsuleViewer
): Promise<{ intent: TimeCapsuleEntry | null; reflection: TimeCapsuleEntry | null }> {
  const { intent, reflection } = await getCapsuleYear(db, ownerId, year);
  const visible = (entry: TimeCapsuleEntry | null) => (entry && canSeeCapsuleEntry(entry.visibility, ownerId, viewer) ? entry : null);
  return { intent: visible(intent), reflection: visible(reflection) };
}
