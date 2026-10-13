import React from "react";
import type { Block } from "@/packages/contracts/src";

export function MediaGalleryBlockView({ block }: { block: Extract<Block, { type: "mediaGallery" }> }) {
  const { images } = block.props;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full my-6">
      {images.map((image, index) => (
        <div
          key={index}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 aspect-video"
        >
          <img
            src={image.url}
            alt={image.caption || `Gallery image ${index + 1}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {image.caption && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 text-xs text-white/90">
              {image.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
