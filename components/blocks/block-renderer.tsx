import React from "react";
import type { Block } from "@nextlevelbuilder/contracts";
import { HeroBlockView } from "./hero-block";
import { GridBlockView } from "./grid-block";
import { PricingBlockView } from "./pricing-block";
import { QuoteBlockView } from "./quote-block";
import { FaqBlockView } from "./faq-block";
import { LiveDemoBlockView } from "./live-demo-block";
import { MediaGalleryBlockView } from "./media-gallery-block";
import { ChangelogBlockView } from "./changelog-block";
import { RoadmapBlockView } from "./roadmap-block";
import { TechStackBlockView } from "./tech-stack-block";
import { CtaBlockView } from "./cta-block";
import { FounderBlockView } from "./founder-block";
import { VerificationBlockView } from "./verification-block";
import { MilestonesBlockView } from "./milestones-block";
import { CaseStudyBlockView } from "./case-study-block";
import { AnalyticsBlockView } from "./analytics-block";
import { ActivitiesBlockView } from "./activities-block";
import { PulseBlockView } from "./pulse-block";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";
import "./product-blocks.css";

export type { BlockLabels } from "./block-labels";

export interface BlockRendererProps {
  blocks: Block[];
  productSlug?: string;
  /** Localised kickers and link suffixes; English defaults when omitted. */
  labels?: Partial<BlockLabels>;
}

export function BlockRenderer({ blocks, productSlug, labels: labelOverrides }: BlockRendererProps) {
  if (!blocks || blocks.length === 0) {
    return null;
  }
  const labels: BlockLabels = { ...DEFAULT_BLOCK_LABELS, ...labelOverrides };

  return (
    <div className="blk-stack-flow flex flex-col w-full max-w-5xl mx-auto">
      {blocks.map((block) => {
        switch (block.type) {
          case "hero":
            return <HeroBlockView key={block.id} block={block} labels={labels} />;
          case "grid":
            return <GridBlockView key={block.id} block={block} labels={labels} />;
          case "pricing":
            return <PricingBlockView key={block.id} block={block} labels={labels} />;
          case "quote":
            return <QuoteBlockView key={block.id} block={block} />;
          case "faq":
            return <FaqBlockView key={block.id} block={block} labels={labels} />;
          case "liveDemo":
            return <LiveDemoBlockView key={block.id} block={block} />;
          case "mediaGallery":
            return <MediaGalleryBlockView key={block.id} block={block} labels={labels} />;
          case "carousel":
            return <MediaGalleryBlockView key={block.id} block={{ id: block.id, type: "mediaGallery", props: { images: block.props.items.map(i => ({ url: i.imageUrl, caption: i.title, aspectRatio: "16:9" })) } }} labels={labels} />;
          case "changelog":
            return <ChangelogBlockView key={block.id} block={block} />;
          case "roadmap":
            return <RoadmapBlockView key={block.id} block={block} />;
          case "techStack":
            return <TechStackBlockView key={block.id} block={block} labels={labels} />;
          case "cta":
            return <CtaBlockView key={block.id} block={block} labels={labels} />;
          case "founder":
            return <FounderBlockView key={block.id} block={block} labels={labels} />;
          case "verification":
            return <VerificationBlockView key={block.id} block={block} />;
          case "milestones":
            return <MilestonesBlockView key={block.id} block={block} />;
          case "caseStudy":
            return <CaseStudyBlockView key={block.id} block={block} />;
          case "analytics":
            return <AnalyticsBlockView key={block.id} block={block} productSlug={productSlug} />;
          case "activities":
            return <ActivitiesBlockView key={block.id} block={block} />;
          case "pulse":
            return <PulseBlockView key={block.id} block={block} productSlug={productSlug} />;
          default: {
            // Compile-time exhaustiveness check: a new block type without a case fails typechecking here.
            block satisfies never;
            return null;
          }
        }
      })}
    </div>
  );
}
