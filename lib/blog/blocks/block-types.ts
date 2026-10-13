/** Shared shapes for the blog block catalogue (isomorphic, type-only). */
import type { z } from "zod";

export type BlockCategory = "section" | "primitive";

/** One catalogue entry before the registry attaches its type name and category. */
export interface BlockSpec {
  title: string;
  description: string;
  schema: z.ZodTypeAny;
  example: Record<string, unknown>;
}

/** A block as stored in `blog_posts.blocks` and exchanged over the API. */
export interface BlogBlock {
  type: string;
  props: Record<string, unknown>;
  id?: string;
}

/** Catalogue entry as served by GET /api/v1/blog/blocks. */
export interface BlogBlockDefinition {
  type: string;
  title: string;
  description: string;
  category: BlockCategory;
  propsSchema: object;
  example: BlogBlock;
}

export interface BlockIssue {
  path: string;
  message: string;
}
