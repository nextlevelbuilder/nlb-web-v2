import React from "react";
import type { FounderBlock } from "@nextlevelbuilder/contracts";
import { BlockSection } from "./block-section";
import { DEFAULT_BLOCK_LABELS, type BlockLabels } from "./block-labels";

/** Normalise an X handle ("@name", "name") to the bare handle. */
export function bareXHandle(handle: string | null | undefined): string | null {
  const raw = handle?.trim() ?? "";
  // Accept a pasted profile URL as well as "@name" / "name".
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})\/?$/i)?.[1];
  const bare = fromUrl ?? raw.replace(/^@+/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(bare) ? bare : null;
}

/** Maker card: portrait (or an italic monogram), name in display type, bio and profile links. */
export function FounderBlockView({ block, labels = DEFAULT_BLOCK_LABELS }: { block: FounderBlock; labels?: BlockLabels }) {
  const { name, bio, avatarUrl, xHandle, linkedinUrl } = block.props;
  const handle = bareXHandle(xHandle);

  return (
    <BlockSection blockId={block.id} kicker={labels.founder} className="blk-founder">
      <div className="blk-founder-card surface">
        <div className="blk-founder-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" width={96} height={96} loading="lazy" decoding="async" />
          ) : (
            <span className="blk-founder-monogram" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="blk-founder-body">
          <h3 className="blk-founder-name">{name}</h3>
          <p className="blk-founder-bio">{bio}</p>
          {(handle || linkedinUrl) && (
            <ul className="blk-founder-links">
              {handle && (
                <li>
                  <a className="link-arrow" href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer">
                    @{handle}
                    <span className="sr-only">{labels.opensInNewTab}</span>
                  </a>
                </li>
              )}
              {linkedinUrl && (
                <li>
                  <a className="link-arrow" href={linkedinUrl} target="_blank" rel="noopener noreferrer">
                    {labels.linkedin}
                    <span className="sr-only">{labels.opensInNewTab}</span>
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </BlockSection>
  );
}
