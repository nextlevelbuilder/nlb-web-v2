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

export const createCourseVideoSchema = z
  .object({
    slug: courseSlugSchema,
    title: z.string().trim().min(1).max(200),
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
    title: z.string().trim().min(1).max(200),
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
