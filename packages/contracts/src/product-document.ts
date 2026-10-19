import { z } from "zod";
import { HttpUrlSchema } from "./http-url.js";
import { BlockSchema } from "./blocks.js";

// Product Listing Document Schema
export const ProductDocumentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  title: z.string().min(1).max(100),
  tagline: z.string().min(1).max(200),
  description: z.string().min(10).max(2000),
  websiteUrl: HttpUrlSchema,
  logoUrl: HttpUrlSchema.optional(),
  categorySlugs: z.array(z.string()).min(1).max(5),
  tagSlugs: z.array(z.string()).max(10).default([]),
  blocks: z.array(BlockSchema).default([]),
});

export type ProductDocument = z.infer<typeof ProductDocumentSchema>;

