import { z } from "zod";

/** URL-safe slug: lowercase words separated by single hyphens. */
export const courseSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, digits and single hyphens");

// Cloudflare Stream video uids are 32 lowercase hex characters.
const streamUidSchema = z.string().regex(/^[a-f0-9]{32}$/, "Stream uid must be 32 lowercase hex characters");

const httpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith("https://"), "URL must use https");

// Polar's minimum fixed price is 50 cents; cap at 100k to catch unit mistakes (dollars vs cents).
const priceCentsSchema = z.number().int().min(50).max(10_000_000);
const currencySchema = z
  .string()
  .regex(/^[a-zA-Z]{3}$/, "Currency must be a 3-letter ISO code")
  .transform((value) => value.toLowerCase());

// The title is sent unchanged as the Polar product name, which Polar limits to 3–64 characters.
export const COURSE_VIDEO_TITLE_MIN = 3;
export const COURSE_VIDEO_TITLE_MAX = 64;
export const COURSE_VIDEO_TITLE_TOO_LONG_MESSAGE = `Title must be at most ${COURSE_VIDEO_TITLE_MAX} characters (the Polar product name limit)`;
const courseVideoTitleSchema = z
  .string()
  .trim()
  .min(COURSE_VIDEO_TITLE_MIN, `Title must be at least ${COURSE_VIDEO_TITLE_MIN} characters (the Polar product name minimum)`)
  .max(COURSE_VIDEO_TITLE_MAX, COURSE_VIDEO_TITLE_TOO_LONG_MESSAGE);

export const createCourseVideoSchema = z
  .object({
    slug: courseSlugSchema,
    title: courseVideoTitleSchema,
    description: z.string().max(5000).default(""),
    locale: z.enum(["en", "vi"]).default("vi"),
    weekNumber: z.number().int().min(0).max(1000).nullable().optional(),
    streamUid: streamUidSchema.nullable().optional(),
    durationSec: z.number().int().min(0).max(60 * 60 * 24).default(0),
    priceCents: priceCentsSchema,
    currency: currencySchema.default("usd"),
    thumbnailUrl: httpsUrlSchema.nullable().optional(),
  })
  .strict();
export type CreateCourseVideoInput = z.infer<typeof createCourseVideoSchema>;

/** Partial update. Publishing has its own endpoint, so `status` only moves between draft and archived. */
export const updateCourseVideoSchema = z
  .object({
    title: courseVideoTitleSchema,
    description: z.string().max(5000),
    locale: z.enum(["en", "vi"]),
    weekNumber: z.number().int().min(0).max(1000).nullable(),
    streamUid: streamUidSchema.nullable(),
    durationSec: z.number().int().min(0).max(60 * 60 * 24),
    priceCents: priceCentsSchema,
    currency: currencySchema,
    thumbnailUrl: httpsUrlSchema.nullable(),
    status: z.enum(["draft", "archived"]),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");
export type UpdateCourseVideoInput = z.infer<typeof updateCourseVideoSchema>;

export const courseCheckoutSchema = z
  .object({ locale: z.enum(["en", "vi"]).optional() })
  .strict();

// Stream accepts uploads up to 30 GB and videos up to 6 hours.
export const createCourseUploadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sizeBytes: z.number().int().min(1).max(30 * 1024 ** 3),
    maxDurationSec: z.number().int().min(1).max(6 * 60 * 60).optional(),
  })
  .strict();
export type CreateCourseUploadInput = z.infer<typeof createCourseUploadSchema>;

export const streamUidParamSchema = streamUidSchema;
