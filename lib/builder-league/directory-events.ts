/**
 * Canonical Builder League events from the product directory.
 *
 * The first moderator approval of a product records one SHIP `ship_product_launch` event for the
 * submitter: source `directory`, external id = product id, `system_verified` (a moderator already
 * reviewed the listing), awarded by the system. Later revisions of the same product never count: only
 * the product's earliest approved submission records an event. The award dedupes on the project linked
 * to the product, so the opt-in backfill of the same launch can never award it twice.
 *
 * Only submitters with Builder League access (`getViewerAccess(...).canUse`) are recorded; nothing is
 * written for anyone else, who can import the launch later through the opt-in backfill.
 *
 * A product launches once, for one member, whichever source records it first: the directory hook and the
 * backfill both take the product's launch claim (`claimProductLaunch`) before writing anything. The claim
 * is a single `INSERT ... ON CONFLICT DO NOTHING`, so concurrent runs cannot both win.
 *
 * Product votes and Product Trust are never inputs. Everything here is best-effort and must never break
 * the moderation path that calls it.
 */
import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { builderEvents, products, scoreCapSlots, submissions, users } from "@/lib/db/schema";
import { getViewerAccess } from "./access";
import { awardForEventDetailed, builderDedupeKey, recordBuilderEvent } from "./ledger";
import { refreshProgression } from "./progression-refresh";
import { findOrCreateProductProject } from "./projects";
import type { EventTypeKey } from "./types";

/** The ruleset v2 SHIP launch event. */
export const DIRECTORY_LAUNCH_EVENT: EventTypeKey = "ship_product_launch";

export type DirectoryLaunchOutcome =
  | { status: "recorded"; eventId: string; eventCreated: boolean; entryId: string | null; awardReason: string | null }
  | { status: "skipped"; reason: "not_first_approval" | "product_not_found" | "submitter_not_found" | "no_league_access" | "already_recorded" };

export type LaunchSource = "directory" | "backfill";

/** The `external_event_id` each source records a product launch under. */
function launchExternalId(source: LaunchSource, productId: string): string {
  return source === "directory" ? productId : `product:${productId}`;
}

/**
 * The launch claim lives in `score_cap_slots` under `launch|product:{id}` (no member id in the key). Its
 * `entry_id` holds the dedupe key of the claiming event, so the holder's replays recognise their claim.
 * Reversals release slots by ledger entry id and never match it: a reversed launch stays claimed.
 */
function launchClaimKey(productId: string): string {
  return `launch|product:${productId}`;
}

function launchClaimMarker(source: LaunchSource, productId: string, userId: string): string {
  return builderDedupeKey(source, launchExternalId(source, productId), userId, DIRECTORY_LAUNCH_EVENT);
}

async function launchClaimHolder(db: AppDb, productId: string): Promise<string | null> {
  const [row] = await db
    .select({ marker: scoreCapSlots.entryId })
    .from(scoreCapSlots)
    .where(eq(scoreCapSlots.slotKey, launchClaimKey(productId)))
    .limit(1);
  return row?.marker ?? null;
}

/**
 * Claims the product's launch for one member and source. True when this caller holds the claim (new or
 * replayed), false when another member or source already holds it.
 */
export async function claimProductLaunch(db: AppDb, input: { productId: string; userId: string; source: LaunchSource }): Promise<boolean> {
  const marker = launchClaimMarker(input.source, input.productId, input.userId);
  await db
    .insert(scoreCapSlots)
    .values({ slotKey: launchClaimKey(input.productId), userId: input.userId, entryId: marker, createdAt: new Date() })
    .onConflictDoNothing({ target: scoreCapSlots.slotKey });
  return (await launchClaimHolder(db, input.productId)) === marker;
}

/**
 * Gives a claim back when its holder failed before recording the launch event, so the launch can still be
 * recorded later (for example by the backfill). A claim whose event exists is never released.
 */
export async function releaseProductLaunchClaim(db: AppDb, input: { productId: string; userId: string; source: LaunchSource }): Promise<void> {
  const marker = launchClaimMarker(input.source, input.productId, input.userId);
  await db
    .delete(scoreCapSlots)
    .where(and(
      eq(scoreCapSlots.slotKey, launchClaimKey(input.productId)),
      eq(scoreCapSlots.entryId, marker),
      sql`not exists (select 1 from ${builderEvents} where ${builderEvents.dedupeKey} = ${marker})`
    ));
}

/** Read-only: true when someone other than this member and source holds the product's launch claim. */
export async function productLaunchClaimedByOther(db: AppDb, input: { productId: string; userId: string; source: LaunchSource }): Promise<boolean> {
  const holder = await launchClaimHolder(db, input.productId);
  return holder !== null && holder !== launchClaimMarker(input.source, input.productId, input.userId);
}

/**
 * True when a launch of this product is already on record, for anyone, from the given sources: the
 * directory hook (external id = product id) or the backfill (`product:{id}`). One product launches
 * once, whether the submitter or the org owner holds it.
 */
export async function productLaunchRecorded(db: AppDb, productId: string, sources: ReadonlyArray<LaunchSource>): Promise<boolean> {
  const conditions = sources.map((source) => and(eq(builderEvents.source, source), eq(builderEvents.externalEventId, launchExternalId(source, productId))));
  if (conditions.length === 0) return false;
  const [row] = await db
    .select({ id: builderEvents.id })
    .from(builderEvents)
    .where(and(eq(builderEvents.eventType, DIRECTORY_LAUNCH_EVENT), or(...conditions)))
    .limit(1);
  return Boolean(row);
}

/**
 * Records the launch for an approved submission. Idempotent: replays find the same event (dedupe on
 * `directory|productId|submitter|ship_product_launch`) and the same ledger entry.
 */
export async function recordDirectoryLaunch(
  db: AppDb,
  input: { submissionId: string; productId: string; submitterId: string; approvedAt: Date }
): Promise<DirectoryLaunchOutcome> {
  const [first] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.productId, input.productId), eq(submissions.status, "approved"), isNotNull(submissions.reviewedAt)))
    .orderBy(asc(submissions.reviewedAt), asc(submissions.id))
    .limit(1);
  if (!first || first.id !== input.submissionId) return { status: "skipped", reason: "not_first_approval" };

  const [product] = await db
    .select({ id: products.id, slug: products.slug, title: products.title, tagline: products.tagline })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!product) return { status: "skipped", reason: "product_not_found" };
  const [submitter] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.submitterId)).limit(1);
  if (!submitter) return { status: "skipped", reason: "submitter_not_found" };
  if (!(await getViewerAccess(db, submitter)).canUse) return { status: "skipped", reason: "no_league_access" };
  // A launch of the same product already claimed by the backfill (possibly for its org owner) counts.
  const claim = { productId: product.id, userId: submitter.id, source: "directory" as const };
  if (!(await claimProductLaunch(db, claim))) return { status: "skipped", reason: "already_recorded" };

  let recorded: Awaited<ReturnType<typeof recordBuilderEvent>>;
  try {
    const project = await findOrCreateProductProject(db, submitter.id, product);
    recorded = await recordBuilderEvent(db, {
      kind: "activity",
      subjectUserId: submitter.id,
      actorUserId: null,
      actorRole: "system",
      projectId: project.id,
      eventType: DIRECTORY_LAUNCH_EVENT,
      source: "directory",
      externalEventId: launchExternalId("directory", product.id),
      occurredAt: input.approvedAt,
      verification: "system_verified",
      visibility: "private",
      payload: { productSlug: product.slug, title: product.title },
      provenance: { submissionId: input.submissionId, productId: product.id },
    });
  } catch (err) {
    // This hook never runs again for the product, so hand the claim back for a later backfill.
    await releaseProductLaunchClaim(db, claim).catch(() => undefined);
    throw err;
  }
  const { event, created } = recorded;
  const award = await awardForEventDetailed(db, event.id, { actorId: "system", actorRole: "system" });
  if (award.created) await refreshProgression(db, submitter.id, { trigger: "directory_launch", now: input.approvedAt });
  return { status: "recorded", eventId: event.id, eventCreated: created, entryId: award.entry?.id ?? null, awardReason: award.reason };
}

/** `recordDirectoryLaunch` that never throws: failures are logged and reported as null. */
export async function recordDirectoryLaunchSafely(
  db: AppDb,
  input: { submissionId: string; productId: string; submitterId: string; approvedAt: Date }
): Promise<DirectoryLaunchOutcome | null> {
  try {
    return await recordDirectoryLaunch(db, input);
  } catch (err) {
    console.error("builder league: directory launch event failed", input.productId, err instanceof Error ? err.message : err);
    return null;
  }
}
