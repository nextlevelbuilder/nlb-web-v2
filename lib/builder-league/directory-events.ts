/**
 * Canonical Builder League events from the product directory.
 *
 * The first moderator approval of a product records one SHIP `ship_product_launch` event for the
 * submitter: source `directory`, external id = product id, `system_verified` (a moderator already
 * reviewed the listing), awarded by the system. Later revisions of the same product never count: only
 * the product's earliest approved submission records an event. The award dedupes on the project linked
 * to the product, so the opt-in backfill of the same launch can never award it twice.
 *
 * Product votes and Product Trust are never inputs. Everything here is best-effort and must never break
 * the moderation path that calls it.
 */
import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { builderEvents, products, submissions, users } from "@/lib/db/schema";
import { awardForEventDetailed, recordBuilderEvent } from "./ledger";
import { refreshProgression } from "./progression-refresh";
import { findOrCreateProductProject } from "./projects";
import type { EventTypeKey } from "./types";

/** The ruleset v2 SHIP launch event. */
export const DIRECTORY_LAUNCH_EVENT: EventTypeKey = "ship_product_launch";

export type DirectoryLaunchOutcome =
  | { status: "recorded"; eventId: string; eventCreated: boolean; entryId: string | null; awardReason: string | null }
  | { status: "skipped"; reason: "not_first_approval" | "product_not_found" | "submitter_not_found" | "already_recorded" };

/**
 * True when a launch of this product is already on record, for anyone, from the given sources: the
 * directory hook (external id = product id) or the backfill (`product:{id}`). One product launches
 * once, whether the submitter or the org owner holds it.
 */
export async function productLaunchRecorded(db: AppDb, productId: string, sources: ReadonlyArray<"directory" | "backfill">): Promise<boolean> {
  const conditions = sources.map((source) =>
    and(eq(builderEvents.source, source), eq(builderEvents.externalEventId, source === "directory" ? productId : `product:${productId}`))
  );
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
  const [submitter] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.submitterId)).limit(1);
  if (!submitter) return { status: "skipped", reason: "submitter_not_found" };
  // A backfilled launch of the same product (possibly for its org owner) already counts.
  if (await productLaunchRecorded(db, product.id, ["backfill"])) return { status: "skipped", reason: "already_recorded" };

  const project = await findOrCreateProductProject(db, submitter.id, product);
  const { event, created } = await recordBuilderEvent(db, {
    kind: "activity",
    subjectUserId: submitter.id,
    actorUserId: null,
    actorRole: "system",
    projectId: project.id,
    eventType: DIRECTORY_LAUNCH_EVENT,
    source: "directory",
    externalEventId: product.id,
    occurredAt: input.approvedAt,
    verification: "system_verified",
    visibility: "private",
    payload: { productSlug: product.slug, title: product.title },
    provenance: { submissionId: input.submissionId, productId: product.id },
  });
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
