import type { BlogBlockProps, BlogBlockType } from "@/lib/blog/blocks/registry";

/** Per-document render state shared by all blocks of one post. */
export interface BlockRenderContext {
  /** Allocates unique heading anchors across rich-text and heading blocks. */
  nextId: (text: string) => string;
}

export interface BlockViewProps<T extends BlogBlockType> {
  props: BlogBlockProps<T>;
  ctx: BlockRenderContext;
}

/** Width classes: prose for reading, wide/full break out of the text column. */
export const WIDTH_CLASS = {
  prose: "mx-auto max-w-prose",
  wide: "mx-auto max-w-4xl",
  full: "mx-auto max-w-wrap",
} as const;
