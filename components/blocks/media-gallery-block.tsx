import React from "react";
import type { Block } from "@nextlevelbuilder/contracts";
import { BlockSection } from "./block-section";
import { DEFAULT_BLOCK_LABELS, numberedLabel, type BlockLabels } from "./block-labels";

type MediaGalleryBlock = Extract<Block, { type: "mediaGallery" }>;
type AspectRatio = MediaGalleryBlock["props"]["images"][number]["aspectRatio"];

/** Intrinsic size per declared ratio so the browser reserves space before the image loads (no layout shift). */
const SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1600, height: 900 },
  "4:3": { width: 1200, height: 900 },
  "1:1": { width: 900, height: 900 },
};

function sizeOf(ratio: AspectRatio | undefined) {
  return SIZES[ratio ?? "16:9"] ?? SIZES["16:9"];
}

/**
 * Lead screenshot large with its caption, the rest as a thumbnail strip. Thumbnails link to the
 * full-size image, so the gallery works without JavaScript.
 */
export function MediaGalleryBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: MediaGalleryBlock; labels?: BlockLabels }) {
  const { images } = block.props;
  if (!images?.length) return null;
  const [lead, ...rest] = images;
  const leadSize = sizeOf(lead.aspectRatio);

  return (
    <BlockSection blockId={block.id} kicker={labels.gallery} className="blk-gallery">
      <figure className="blk-gallery-lead surface">
        <div className="blk-gallery-frame" data-ratio={lead.aspectRatio ?? "16:9"}>
          <img
            src={lead.url}
            alt={lead.caption || numberedLabel(labels.imageAlt, 1)}
            width={leadSize.width}
            height={leadSize.height}
            loading="lazy"
            decoding="async"
          />
        </div>
        {lead.caption && (
          <figcaption className="blk-gallery-caption">
            <span className="mono num-tab" aria-hidden="true">01</span>
            <span>{lead.caption}</span>
          </figcaption>
        )}
      </figure>

      {rest.length > 0 && (
        <ul className="blk-gallery-strip" data-count={rest.length}>
          {rest.map((image, index) => {
            const n = index + 2;
            const size = sizeOf(image.aspectRatio);
            return (
              <li key={`${image.url}-${n}`}>
                <a className="blk-gallery-thumb" href={image.url} target="_blank" rel="noopener noreferrer">
                  <span className="blk-gallery-frame" data-ratio={image.aspectRatio ?? "16:9"}>
                    <img
                      src={image.url}
                      alt={image.caption || numberedLabel(labels.imageAlt, n)}
                      width={size.width}
                      height={size.height}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="blk-gallery-thumb-meta">
                    <span className="mono num-tab" aria-hidden="true">{String(n).padStart(2, "0")}</span>
                    {image.caption && <span className="blk-gallery-thumb-caption">{image.caption}</span>}
                  </span>
                  <span className="sr-only">{numberedLabel(labels.openImage, n)} {labels.opensInNewTab}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </BlockSection>
  );
}
