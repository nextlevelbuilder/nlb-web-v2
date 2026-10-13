/**
 * Boundary validation for blog post writes and list queries. Field limits follow the HTTP contract.
 * `blocks` is accepted as unknown here and validated by the block registry, which reports per-block
 * paths and distinguishes the 200 KB size limit (413) from ordinary validation failures (400).
 */
import { z } from "zod";
import { imageSrc, text } from "./blocks/block-fields";
import { BLOG_SLUG_RE, MAX_BLOG_SLUG_LENGTH } from "./blog-slug-rules";
import { BLOG_LOCALES } from "./blog-types";

export const BLOG_LIMITS = {
  title: 160,
  description: 320,
  tags: 12,
  tagLength: 32,
  authorName: 120,
  translationKey: 64,
} as const;

const slug = z
  .string()
  .trim()
  .min(1)
  .max(MAX_BLOG_SLUG_LENGTH)
  .regex(BLOG_SLUG_RE, "Slugs are lowercase kebab-case, e.g. shipping-on-workers.");

const absoluteHttpUrl = z.string().trim().max(500).url().regex(/^https?:\/\//i, "Use an http(s) URL.");

export const blogSeoSchema = z
  .object({
    title: z.string().trim().min(1).max(BLOG_LIMITS.title).optional(),
    description: z.string().trim().min(1).max(BLOG_LIMITS.description).optional(),
    ogImage: imageSrc.optional(),
    canonical: absoluteHttpUrl.optional(),
    noindex: z.boolean().optional(),
  })
  .strict();

const tags = z
  .array(z.string().trim().min(1).max(BLOG_LIMITS.tagLength))
  .max(BLOG_LIMITS.tags)
  .transform((values) => [...new Set(values)]);

const blocks = z.unknown().refine((value) => value !== undefined, "Required");

const editableFields = {
  locale: z.enum(BLOG_LOCALES),
  slug,
  title: text(BLOG_LIMITS.title),
  description: z.string().trim().max(BLOG_LIMITS.description).nullable().optional(),
  blocks,
  coverUrl: imageSrc.nullable().optional(),
  tags: tags.optional(),
  seo: blogSeoSchema.optional(),
  translationKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,64}$/, "Use 1-64 letters, digits, '.', '-' or '_'.")
    .nullable()
    .optional(),
  authorName: z.string().trim().min(1).max(BLOG_LIMITS.authorName).nullable().optional(),
};

export const versionSchema = z.number({ invalid_type_error: "version must be an integer" }).int().min(1);

export const createPostSchema = z.object(editableFields);

export const patchPostSchema = z
  .object({
    version: versionSchema,
    locale: editableFields.locale.optional(),
    slug: slug.optional(),
    title: editableFields.title.optional(),
    description: editableFields.description,
    blocks: z.unknown().optional(),
    coverUrl: editableFields.coverUrl,
    tags: editableFields.tags,
    seo: editableFields.seo,
    translationKey: editableFields.translationKey,
    authorName: editableFields.authorName,
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), { message: "Provide at least one field to update.", path: [] });

export const versionBodySchema = z.object({ version: versionSchema });
export const versionQuerySchema = z.object({ version: z.coerce.number().int().min(1) });

export const listPostsQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).optional(),
  status: z.enum(["draft", "published", "archived", "all"]).default("published"),
  tag: z.string().trim().min(1).max(BLOG_LIMITS.tagLength).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type PatchPostInput = z.infer<typeof patchPostSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

/** Flattens zod issues into `[{ path: "seo.ogImage", message }]` for humans and agents. */
export function zodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
}
