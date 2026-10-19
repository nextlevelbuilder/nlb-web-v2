'use client';

import React from 'react';
import { BlockRenderer } from '@/components/blocks/block-renderer';
import ProductLogo from '@/components/product-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, X, Send, ExternalLink } from 'lucide-react';
import type { Block } from '@nextlevelbuilder/contracts';

export interface StudioPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tagline: string;
  logoUrl?: string;
  websiteUrl?: string;
  slug?: string;
  blocks: Block[];
  onPublishOrSubmit: () => void;
  isSubmitting?: boolean;
}

export default function StudioPreviewModal({
  isOpen,
  onClose,
  title,
  tagline,
  logoUrl,
  websiteUrl,
  blocks,
  onPublishOrSubmit,
  isSubmitting = false,
}: StudioPreviewModalProps) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // Parents pass an inline onClose; a ref keeps the listener stable across their re-renders.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus moves into the dialog when it opens, and Escape closes it.
  React.useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-preview-title"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas-deep p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant="outline" className="gap-1.5 border-warning/50 text-warning">
            <Eye aria-hidden className="h-3.5 w-3.5" />
            Live Draft Preview
          </Badge>
          <span className="hidden text-step-xs text-ink-3 sm:inline">
            Viewing real-time rendering of your {blocks.length} blocks
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={onPublishOrSubmit} disabled={isSubmitting} className="gap-2">
            <Send aria-hidden className="h-3.5 w-3.5" />
            {isSubmitting ? 'Submitting...' : 'Submit for Review'}
          </Button>
          <Button ref={closeRef} type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close preview">
            <X aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-12">
        <div className="wrap max-w-5xl space-y-12">
          <header className="flex flex-col items-start justify-between gap-6 border-b border-line pb-8 md:flex-row md:items-center">
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface-raised text-primary">
                <ProductLogo src={logoUrl} name={title || 'P'} />
              </div>
              <div className="min-w-0">
                <h2 id="studio-preview-title" className="break-words font-display text-step-2xl font-light text-foreground">
                  {title || 'Product Title'}
                </h2>
                <p className="mt-1 text-step-md text-ink-2">{tagline || 'Product Tagline'}</p>
              </div>
            </div>

            {websiteUrl && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                  Visit Website
                  <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
          </header>

          <BlockRenderer blocks={blocks} />
        </div>
      </div>
    </div>
  );
}
