/**
 * The renderer half of the block catalogue. RENDERERS is typed against every BlogBlockType from
 * lib/blog/blocks/registry.ts, so adding a block type without a renderer fails type-checking.
 * Props are re-validated at render time: stored blocks were validated on write, but a later schema
 * change must never let stale data reach a renderer, so invalid or unknown blocks render nothing.
 */
import React, { type ReactNode } from "react";
import { getBlockSchema, isBlogBlockType, type BlogBlockType } from "@/lib/blog/blocks/registry";
import type { BlogBlock } from "@/lib/blog/blocks/block-types";
import { createHeadingIdAllocator } from "@/lib/blog/markdown/heading-id";
import type { BlockRenderContext, BlockViewProps } from "./blog-block-view-types";
import { CodeBlock, EmbedBlock, GalleryBlock, ImageBlock, VideoBlock } from "./blog-media-blocks";
import { ButtonBlock, CtaBlock, DividerBlock, HeadingBlock, ListBlock, ParagraphBlock, TableBlock } from "./blog-structure-blocks";
import { CalloutBlock, FaqBlock, HeroBlock, KeyTakeawaysBlock, QuoteBlock, RichTextBlock } from "./blog-text-blocks";

type RendererMap = { [T in BlogBlockType]: (view: BlockViewProps<T>) => ReactNode };

const RENDERERS: RendererMap = {
  hero: HeroBlock,
  "rich-text": RichTextBlock,
  callout: CalloutBlock,
  quote: QuoteBlock,
  image: ImageBlock,
  gallery: GalleryBlock,
  video: VideoBlock,
  code: CodeBlock,
  cta: CtaBlock,
  faq: FaqBlock,
  "key-takeaways": KeyTakeawaysBlock,
  table: TableBlock,
  heading: HeadingBlock,
  paragraph: ParagraphBlock,
  list: ListBlock,
  divider: DividerBlock,
  button: ButtonBlock,
  embed: EmbedBlock,
};

function renderBlock(block: BlogBlock, ctx: BlockRenderContext): ReactNode {
  if (!isBlogBlockType(block.type)) return null;
  const parsed = getBlockSchema(block.type).safeParse(block.props);
  if (!parsed.success) return null;
  // The map is keyed by the same type the props were just parsed with; TypeScript cannot correlate
  // the generic key with the union, so widen the renderer to the parsed (already validated) props.
  const Renderer = RENDERERS[block.type] as (view: { props: unknown; ctx: BlockRenderContext }) => ReactNode;
  return <Renderer props={parsed.data} ctx={ctx} />;
}

/** Renders a post's blocks in order with shared per-document state (unique heading anchors). */
export function BlogBlocks({ blocks }: { blocks: BlogBlock[] }) {
  const ctx: BlockRenderContext = { nextId: createHeadingIdAllocator() };
  return (
    <div className="space-y-8">
      {blocks.map((block, index) => (
        <div key={block.id ?? `${block.type}-${index}`} data-block={block.type} id={block.id}>
          {renderBlock(block, ctx)}
        </div>
      ))}
    </div>
  );
}
