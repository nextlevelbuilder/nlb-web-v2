import type { BlogBlockProps, BlogBlockType } from "@/lib/blog/blocks/registry";
import type { BlogLocale } from "@/lib/blog/blog-types";

/** Per-document render state shared by all blocks of one post. */
export interface BlockRenderContext {
  /** Allocates unique heading anchors across rich-text and heading blocks. */
  nextId: (text: string) => string;
  /** Locale of the post, for the few labels a block renders itself (callout tones, copy buttons). */
  locale: BlogLocale;
}

export interface BlockViewProps<T extends BlogBlockType> {
  props: BlogBlockProps<T>;
  ctx: BlockRenderContext;
}

/** Column a block occupies in the article grid (blog-pages.css): the reading column, wider, or the page. */
export type BlockWidth = "prose" | "wide" | "full";
