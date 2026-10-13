'use client';

import React from 'react';
import { BlockRenderer } from '@/components/blocks/block-renderer';
import ProductLogo from '@/components/product-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, X, Send, Sparkles, ExternalLink } from 'lucide-react';
import type { Block } from '@/packages/contracts/src';

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
  slug,
  blocks,
  onPublishOrSubmit,
  isSubmitting = false,
}: StudioPreviewModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-2xl overflow-hidden animate-in fade-in duration-200">
      {/* Top Preview Control Header Bar */}
      <div className="p-4 border-b border-white/10 bg-black/60 flex items-center justify-between gap-4 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs px-3 py-1 gap-1.5 font-mono">
            <Eye className="w-3.5 h-3.5" />
            Live Draft Preview
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Viewing real-time rendering of your {blocks.length} blocks
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={onPublishOrSubmit}
            disabled={isSubmitting}
            className="rounded-full gap-2 px-6 shadow-lg btn-premium font-bold text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            {isSubmitting ? 'Submitting...' : 'Publish / Submit for Review'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Rendered Product Surface */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-5xl mx-auto space-y-12">
          {/* Header Banner */}
          <div className="border-b border-white/10 pb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-2xl text-primary overflow-hidden shrink-0">
                <ProductLogo src={logoUrl} name={title || 'P'} />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{title || 'Product Title'}</h1>
                <p className="text-lg text-muted-foreground mt-1">{tagline || 'Product Tagline'}</p>
              </div>
            </div>

            {websiteUrl && (
              <Button asChild variant="outline" size="sm" className="rounded-full gap-2 text-xs border-white/20">
                <a href={websiteUrl} target="_blank" rel="noreferrer">
                  Visit Website
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}
          </div>

          {/* Render All Document Blocks */}
          <BlockRenderer blocks={blocks} />
        </div>
      </div>
    </div>
  );
}
