import { asc, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { courseVideos } from "@/lib/db/schema";
import { CourseError, courseNotFound } from "./course-errors";
import { ensureCourseVideoPolarProduct, type CoursePolarProductsClient } from "./course-polar-product";
import type { CreateCourseVideoInput, UpdateCourseVideoInput } from "./course-video-schemas";
import { getCourseRuntimeEnv } from "./course-runtime-env";
import {
  createStreamUploadClient,
  createStreamVideoClient,
  loadStreamVideoApiConfig,
  type StreamUploadClient,
  type StreamVideoClient,
} from "./stream-video-api";

/** Stream client from runtime config; resolved lazily so videos without a uid need no Stream setup. */
export function defaultStreamVideoClient(): StreamVideoClient {
  return { requireSignedUrls: (uid) => createStreamVideoClient(loadStreamVideoApiConfig(getCourseRuntimeEnv())).requireSignedUrls(uid) };
}

/** Stream upload client from runtime config; 503 until the Stream API token is set. */
export function defaultStreamUploadClient(): StreamUploadClient {
  return createStreamUploadClient(loadStreamVideoApiConfig(getCourseRuntimeEnv()));
}

export type CourseVideoRow = typeof courseVideos.$inferSelect;

/** Public projection: never exposes the Stream uid or the Polar product id. */
export interface PublicCourseVideo {
  id: string;
  slug: string;
  title: string;
  description: string;
  locale: "en" | "vi";
  weekNumber: number | null;
  durationSec: number;
  priceCents: number;
  currency: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

export function toPublicCourseVideo(video: CourseVideoRow): PublicCourseVideo {
  return {
    id: video.id,
    slug: video.slug,
    title: video.title,
    description: video.description,
    locale: video.locale,
    weekNumber: video.weekNumber ?? null,
    durationSec: video.durationSec,
    priceCents: video.priceCents,
    currency: video.currency,
    thumbnailUrl: video.thumbnailUrl ?? null,
    publishedAt: video.publishedAt ? video.publishedAt.toISOString() : null,
  };
}

/** Published videos ordered by week (unnumbered last), then newest first. */
export async function listPublishedVideos(db: AppDb): Promise<CourseVideoRow[]> {
  return db
    .select()
    .from(courseVideos)
    .where(eq(courseVideos.status, "published"))
    .orderBy(sql`${courseVideos.weekNumber} is null`, asc(courseVideos.weekNumber), desc(courseVideos.publishedAt));
}

export async function getVideoBySlug(slug: string, db: AppDb): Promise<CourseVideoRow | null> {
  const [video] = await db.select().from(courseVideos).where(eq(courseVideos.slug, slug)).limit(1);
  return video ?? null;
}

/** Only published videos are visible to the public; drafts and archived videos read as 404. */
export async function getPublishedVideoBySlug(slug: string, db: AppDb): Promise<CourseVideoRow | null> {
  const video = await getVideoBySlug(slug, db);
  return video?.status === "published" ? video : null;
}

async function requireVideo(slug: string, db: AppDb): Promise<CourseVideoRow> {
  const video = await getVideoBySlug(slug, db);
  if (!video) throw courseNotFound();
  return video;
}

/**
 * Create a draft. Registering a Stream uid first marks that video signed-only on Stream, so a uid
 * stored here can never be played without a token.
 */
export async function createVideo(
  input: CreateCourseVideoInput,
  db: AppDb,
  stream: StreamVideoClient = defaultStreamVideoClient()
): Promise<CourseVideoRow> {
  if (await getVideoBySlug(input.slug, db)) {
    throw new CourseError(409, "slug_taken", "A video with this slug already exists");
  }
  if (input.streamUid) await stream.requireSignedUrls(input.streamUid);
  const [created] = await db
    .insert(courseVideos)
    .values({
      slug: input.slug,
      title: input.title,
      description: input.description,
      locale: input.locale,
      weekNumber: input.weekNumber ?? null,
      streamUid: input.streamUid ?? null,
      streamSignedOnly: Boolean(input.streamUid),
      durationSec: input.durationSec,
      priceCents: input.priceCents,
      currency: input.currency,
      thumbnailUrl: input.thumbnailUrl ?? null,
      status: "draft",
    })
    .onConflictDoNothing({ target: courseVideos.slug })
    .returning();
  if (!created) throw new CourseError(409, "slug_taken", "A video with this slug already exists");
  return created;
}

/**
 * Patch a video. Price and currency are frozen once the Polar product exists, because the product's
 * price is what buyers pay; changing it requires a new product.
 */
export async function updateVideo(
  slug: string,
  patch: UpdateCourseVideoInput,
  db: AppDb,
  stream: StreamVideoClient = defaultStreamVideoClient()
): Promise<CourseVideoRow> {
  const video = await requireVideo(slug, db);
  const priceChanged =
    (patch.priceCents !== undefined && patch.priceCents !== video.priceCents) ||
    (patch.currency !== undefined && patch.currency !== video.currency);
  if (priceChanged && video.polarProductId) {
    throw new CourseError(409, "price_locked", "Price cannot change after the Polar product was created");
  }
  if (video.status === "published" && patch.streamUid === null) {
    throw new CourseError(422, "stream_uid_required", "A published video must keep its Stream uid");
  }
  // A new uid is registered signed-only before it is stored; clearing the uid clears the flag.
  const streamChange: Partial<CourseVideoRow> = {};
  if (patch.streamUid !== undefined && patch.streamUid !== video.streamUid) {
    if (patch.streamUid) await stream.requireSignedUrls(patch.streamUid);
    streamChange.streamSignedOnly = Boolean(patch.streamUid);
  }
  const [updated] = await db
    .update(courseVideos)
    .set({ ...patch, ...streamChange, updatedAt: new Date() })
    .where(eq(courseVideos.id, video.id))
    .returning();
  if (!updated) throw courseNotFound();
  return updated;
}

/** Enforce signed-only playback on Stream, create the Polar product (idempotent), then publish. */
export async function publishVideo(
  slug: string,
  db: AppDb,
  polarClient: CoursePolarProductsClient,
  stream: StreamVideoClient = defaultStreamVideoClient()
): Promise<CourseVideoRow> {
  const video = await requireVideo(slug, db);
  if (!video.streamUid) {
    throw new CourseError(422, "stream_uid_required", "Set the Cloudflare Stream uid before publishing");
  }
  // Re-applied on every publish (idempotent): the uid may have been edited on Stream since registration.
  await stream.requireSignedUrls(video.streamUid);
  const polarProductId = await ensureCourseVideoPolarProduct(video, db, polarClient);
  const now = new Date();
  const [published] = await db
    .update(courseVideos)
    .set({ status: "published", polarProductId, streamSignedOnly: true, publishedAt: video.publishedAt ?? now, updatedAt: now })
    .where(eq(courseVideos.id, video.id))
    .returning();
  if (!published) throw courseNotFound();
  return published;
}

export async function archiveVideo(slug: string, db: AppDb): Promise<CourseVideoRow> {
  return updateVideo(slug, { status: "archived" }, db);
}
