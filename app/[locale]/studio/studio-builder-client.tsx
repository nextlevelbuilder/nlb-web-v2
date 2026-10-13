'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Layers,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Code2,
  Globe,
  Save,
  LayoutTemplate as LayoutIcon,
  ExternalLink,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LAYOUT_TEMPLATES } from '@/packages/contracts/src/templates';
import type { Block } from '@/packages/contracts/src/blocks';
import type { ProductDocument } from '@/packages/contracts/src/product-document';
import { normalizeStudioSlug, saveStudioDraft, studioError } from '@/lib/webmcp/studio-draft';
import StudioAgentConnect from '@/components/studio/studio-agent-connect';
import BlockSelectorDropdown, { type BlockType } from '@/components/studio/block-selector-dropdown';
import BlockItemCard from '@/components/studio/block-item-card';
import MediaUploadDropzone from '@/components/studio/media-upload-dropzone';
import StudioPreviewModal from '@/components/studio/studio-preview-modal';

interface StudioBuilderClientProps {
  defaultOrgId?: string;
}

const fieldClass =
  'h-11 w-full rounded-sm border border-input bg-surface px-4 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'mono-label block text-ink-3';
const stepHeadingClass = 'flex items-center gap-2 font-display text-step-lg text-foreground';

export default function StudioBuilderClient({
  defaultOrgId = 'nlb-official',
}: StudioBuilderClientProps) {
  const [orgId] = useState(defaultOrgId);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [categorySlugs, setCategorySlugs] = useState('');
  const [tagSlugs, setTagSlugs] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('saas-launch');

  // Blocks state
  const [blocks, setBlocks] = useState<Block[]>(() => LAYOUT_TEMPLATES[0].generateBlocks({
    title: 'Product Title', tagline: 'Product Tagline', websiteUrl: 'https://example.com',
  }));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Drag & Drop reorder state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Preview Modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Initialize blocks from default template
  const applyTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = LAYOUT_TEMPLATES.find((t) => t.id === templateId) || LAYOUT_TEMPLATES[0];
    const generated = template.generateBlocks({
      title: title || 'Product Title',
      tagline: tagline || 'Product Tagline',
      websiteUrl: websiteUrl || 'https://example.com',
      screenshotUrl: screenshotUrl || logoUrl || undefined,
    });
    setBlocks(generated);
  }, [title, tagline, websiteUrl, screenshotUrl, logoUrl]);

  const documentJson = {
    schemaVersion: 1 as const, title, tagline: tagline || title, description, websiteUrl,
    logoUrl: logoUrl || undefined,
    categorySlugs: categorySlugs.split(',').map((value) => value.trim()).filter(Boolean),
    tagSlugs: tagSlugs.split(',').map((value) => value.trim()).filter(Boolean), blocks,
  };
  const documentRef = useRef<ProductDocument>(documentJson);
  documentRef.current = documentJson;
  const replaceDocument = (document: ProductDocument) => {
    documentRef.current = document;
    setTitle(document.title);
    setTagline(document.tagline);
    setDescription(document.description);
    setWebsiteUrl(document.websiteUrl);
    setLogoUrl(document.logoUrl || '');
    setCategorySlugs(document.categorySlugs.join(', '));
    setTagSlugs(document.tagSlugs.join(', '));
    setBlocks(document.blocks);
    setSelectedTemplateId('');
    setMessage({ type: 'success', text: 'AI design applied to the canvas. Review it before saving.' });
  };

  // Auto-save to localStorage
  useEffect(() => {
    if (!slug && !title) return;
    const saveKey = `nlb_draft_${slug || 'unsaved'}`;
    const stateToSave = {
      orgId,
      slug,
      title,
      tagline,
      description,
      categorySlugs,
      tagSlugs,
      websiteUrl,
      logoUrl,
      screenshotUrl,
      selectedTemplateId,
      blocks,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(saveKey, JSON.stringify(stateToSave));
      setLastSavedTime(new Date().toLocaleTimeString());
    } catch {
      // ignore quota errors
    }
  }, [orgId, slug, title, tagline, description, categorySlugs, tagSlugs, websiteUrl, logoUrl, screenshotUrl, selectedTemplateId, blocks]);

  // Block management functions
  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const newBlocks = [...blocks];
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;
    setBlocks(newBlocks);
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const updateBlock = (index: number, updated: Block) => {
    const newBlocks = [...blocks];
    newBlocks[index] = updated;
    setBlocks(newBlocks);
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...blocks];
    const [movedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    setBlocks(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Create the selected block with editable defaults.
  const addBlock = (type: BlockType) => {
    const id = `${type}-${Date.now()}`;
    let newBlock: Block;

    switch (type) {
      case 'analytics':
        newBlock = { id, type: 'analytics', props: { title: 'Traffic', period: '30d' } };
        break;
      case 'activities':
        newBlock = { id, type: 'activities', props: { title: 'Activities', entries: [] } };
        break;
      case 'pulse':
        newBlock = { id, type: 'pulse', props: { title: 'Pulse', showHistory: true } };
        break;
      case 'hero':
        newBlock = {
          id,
          type: 'hero',
          props: {
            headline: title || 'Next-Gen Developer Platform',
            subheadline: tagline || 'Build and deploy autonomous AI applications on Cloudflare Workers.',
            primaryCtaText: 'Get Started',
            primaryCtaUrl: websiteUrl || 'https://example.com',
            badge: 'Your product highlight',
          },
        };
        break;
      case 'grid':
        newBlock = {
          id,
          type: 'grid',
          props: {
            columns: 3,
            items: [
              { title: 'Ultra-Fast Performance', description: 'Zero cold starts on Cloudflare Edge global network.' },
              { title: 'Developer Centric', description: 'Clean TypeScript contracts and idiomatic SDK interfaces.' },
              { title: 'Verifiable Trust', description: 'Human-moderated reviews and cryptographic Trust Passports.' },
            ],
          },
        };
        break;
      case 'mediaGallery':
        newBlock = {
          id,
          type: 'mediaGallery',
          props: {
            images: [
              { url: screenshotUrl || 'https://placehold.co/1200x675', caption: 'Product Overview Dashboard', aspectRatio: '16:9' },
            ],
          },
        };
        break;
      case 'carousel':
        newBlock = {
          id,
          type: 'carousel',
          props: {
            items: [
              { title: 'Workflow Step 1', imageUrl: 'https://placehold.co/800x450', description: 'Configure settings' },
              { title: 'Workflow Step 2', imageUrl: 'https://placehold.co/800x450', description: 'Deploy instantly' },
            ],
          },
        };
        break;
      case 'liveDemo':
        newBlock = {
          id,
          type: 'liveDemo',
          props: {
            embedUrl: websiteUrl || 'https://example.com',
            sandboxTokens: 'allow-scripts allow-popups allow-forms',
            height: 500,
          },
        };
        break;
      case 'techStack':
        newBlock = {
          id,
          type: 'techStack',
          props: {
            technologies: [
              { name: 'TypeScript', category: 'Language' },
              { name: 'Cloudflare Workers', category: 'Edge Computing' },
              { name: 'Neon PostgreSQL', category: 'Database' },
            ],
          },
        };
        break;
      case 'pricing':
        newBlock = {
          id,
          type: 'pricing',
          props: {
            tiers: [
              { name: 'Starter', price: '$0', features: ['Core features', 'Community support'], ctaText: 'Start Free', isPopular: false },
              { name: 'Pro', price: '$19/mo', features: ['All features', 'Priority support'], ctaText: 'Upgrade', isPopular: true },
            ],
          },
        };
        break;
      case 'faq':
        newBlock = {
          id,
          type: 'faq',
          props: {
            items: [
              { question: 'What is Next Level Builders?', answer: 'A verified directory platform for autonomous coding tools and builders.' },
              { question: 'Where are media files hosted?', answer: 'All product images and video assets are securely stored on Cloudflare R2.' },
            ],
          },
        };
        break;
      case 'founder':
        newBlock = {
          id,
          type: 'founder',
          props: {
            name: 'Builder Founder',
            bio: 'Building open, high-trust developer tooling for the modern web.',
            avatarUrl: logoUrl || undefined,
            xHandle: 'nlbuilder',
          },
        };
        break;
      case 'verification':
        newBlock = {
          id,
          type: 'verification',
          props: {
            metricType: 'uptime',
            verifiedValue: 'Enter a measured value',
            verificationScope: 'Describe the measurement scope',
            verifiedAt: 'Enter the verification date',
            evidenceStandard: 'Link to or describe your evidence',
          },
        };
        break;
      case 'milestones':
        newBlock = {
          id,
          type: 'milestones',
          props: {
            items: [
              { date: '2026-09', title: 'Beta Launch', description: 'Admitted first 100 verified builder products.' },
              { date: '2026-10', title: 'Global Public Directory', description: 'Opened public voting and trust passports.' },
            ],
          },
        };
        break;
      case 'quote':
        newBlock = {
          id,
          type: 'quote',
          props: {
            quote: 'Add an actual customer quote with permission.',
            author: 'Customer name',
            title: 'Customer role and organization',
          },
        };
        break;
      case 'caseStudy':
        newBlock = {
          id,
          type: 'caseStudy',
          props: {
            customerName: 'Customer name',
            problem: 'Describe the customer problem.',
            solution: 'Describe how your product helped.',
            outcome: 'Describe the observed result with supporting evidence.',
          },
        };
        break;
      case 'changelog':
        newBlock = {
          id,
          type: 'changelog',
          props: {
            entries: [
              { version: '1.0.0', date: new Date().toISOString().split('T')[0], changes: ['Initial verified directory launch', 'Cloudflare R2 media hosting'] },
            ],
          },
        };
        break;
      case 'roadmap':
        newBlock = {
          id,
          type: 'roadmap',
          props: {
            milestones: [
              { quarter: 'Q3 2026', title: 'R2 Media Direct Upload', status: 'completed' },
              { quarter: 'Q4 2026', title: 'AI Agent Directory Submissions', status: 'in_progress' },
            ],
          },
        };
        break;
      case 'cta':
      default:
        newBlock = {
          id,
          type: 'cta',
          props: {
            title: 'Ready to Launch Your Builder Tool?',
            subtitle: 'Start building with it today.',
            buttonText: 'Submit Listing Now',
            buttonUrl: websiteUrl || 'https://nextlevelbuilder.io/studio',
          },
        };
        break;
    }

    setBlocks((prev) => [...prev, newBlock]);
  };

  const persistDraft = async () => {
    const savedSlug = await saveStudioDraft({ slug, orgId, document: documentRef.current });
    setSlug(savedSlug);
    return savedSlug;
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const savedSlug = await persistDraft();
      setMessage({ type: 'success', text: "Draft revision saved for '" + savedSlug + "'." });
    } catch (error) {
      setMessage({ type: 'error', text: studioError(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForVerification = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const savedSlug = await persistDraft();
      const response = await fetch('/api/v1/products/' + encodeURIComponent(savedSlug) + '/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFastTrack: false }),
      });
      const data = await response.json();
      if (response.status === 402 && data.checkoutUrl) {
        setMessage({ type: 'success', text: 'Opening secure checkout…' });
        window.location.href = data.checkoutUrl;
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Failed to submit product for review');
      setMessage({ type: 'success', text: "Product '" + savedSlug + "' submitted for review." });
      setIsPreviewOpen(false);
    } catch (error) {
      setMessage({ type: 'error', text: studioError(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-8 p-5 sm:p-8">
      {/* Alert & Auto-save Status */}
      <div aria-live="polite" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {message ? (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`p-3.5 rounded-sm text-sm flex items-center gap-2.5 border flex-1 ${
              message.type === 'success'
                ? 'bg-success/10 border-success/40 text-success'
                : 'bg-destructive/10 border-destructive/40 text-destructive'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 aria-hidden className="w-4 h-4 shrink-0" /> : <AlertCircle aria-hidden className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-step-xs text-ink-3">
            <Save aria-hidden className="w-3.5 h-3.5 text-success" />
            <span>Auto-save active</span>
            {lastSavedTime && <span>(Last saved: {lastSavedTime})</span>}
          </div>
        )}
      </div>

      <StudioAgentConnect getDocument={() => documentRef.current} replaceDocument={replaceDocument} preview={() => setIsPreviewOpen(true)} />

      {/* Metadata Form Grid with R2 Media Upload */}
      <div className="space-y-6">
        <h3 className={`${stepHeadingClass} border-b border-line pb-3`}>
          <Globe aria-hidden className="w-4 h-4 text-primary" />
          1. General Product Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="studio-slug" className={labelClass}>
              Slug (URL Identifier) *
            </label>
            <input
              id="studio-slug"
              type="text"
              autoComplete="off"
              placeholder="e.g. agentkit"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`${fieldClass} font-mono`}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="studio-title" className={labelClass}>
              Product Title *
            </label>
            <input
              id="studio-title"
              type="text"
              placeholder="e.g. AgentKit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="studio-tagline" className={labelClass}>
              Tagline (One-sentence elevator pitch) *
            </label>
            <input
              id="studio-tagline"
              type="text"
              placeholder="e.g. The Agent-First Operating System for Autonomous Coding Agents"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="studio-website" className={labelClass}>
              Website URL *
            </label>
            <input
              id="studio-website"
              type="url"
              placeholder="https://yourproduct.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="studio-description" className={labelClass}>Description *</label>
            <textarea id="studio-description" value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} maxLength={2000} rows={3} placeholder="Describe what your product does (10–2000 characters)." className={`${fieldClass} h-auto py-2.5`} />
          </div>
          <div className="space-y-2">
            <label htmlFor="studio-categories" className={labelClass}>Category slugs * (1–5, comma separated)</label>
            <input id="studio-categories" value={categorySlugs} onChange={(e) => setCategorySlugs(e.target.value)} placeholder="e.g. developer-tools" className={fieldClass} />
          </div>
          <div className="space-y-2">
            <label htmlFor="studio-tags" className={labelClass}>Tag slugs (up to 10, comma separated)</label>
            <input id="studio-tags" value={tagSlugs} onChange={(e) => setTagSlugs(e.target.value)} className={fieldClass} />
          </div>

          {/* Product Logo with R2 Upload */}
          <div className="space-y-2">
            <MediaUploadDropzone
              value={logoUrl}
              onChange={(url) => setLogoUrl(url)}
              label="Product Logo (Cloudflare R2)"
              folder="logos"
              placeholder="Upload square product logo..."
            />
          </div>

          {/* Product Screenshot with R2 Upload */}
          <div className="space-y-2 md:col-span-2">
            <MediaUploadDropzone
              value={screenshotUrl}
              onChange={(url) => setScreenshotUrl(url)}
              label="Main Product Screenshot / Preview Image (Cloudflare R2)"
              folder="screenshots"
              placeholder="Upload 16:9 product showcase image..."
            />
          </div>
        </div>
      </div>

      {/* 5 Layout Templates Selector */}
      <div className="space-y-4 pt-4 border-t border-line">
        <h3 className={stepHeadingClass}>
          <LayoutIcon aria-hidden className="w-4 h-4 text-primary" />
          2. Choose a Layout Template Preset
        </h3>
        <p className="text-step-sm text-ink-2">
          Select one of 5 battle-tested block layout presets to populate your document structure:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {LAYOUT_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              aria-pressed={selectedTemplateId === tmpl.id}
              onClick={() => applyTemplate(tmpl.id)}
              className={`p-4 rounded-sm text-left border transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selectedTemplateId === tmpl.id
                  ? 'bg-primary/10 border-primary'
                  : 'bg-surface border-line hover:border-line-strong'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-step-sm font-medium text-foreground">{tmpl.name}</span>
                <Badge variant="outline">
                  {tmpl.badge}
                </Badge>
              </div>
              <p className="text-step-xs leading-relaxed text-ink-2">{tmpl.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Visual Block Document Editor with Drag & Drop */}
      <div className="space-y-4 pt-4 border-t border-line">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className={stepHeadingClass}>
              <Layers aria-hidden className="w-4 h-4 text-primary" />
              3. Visual Block Document Canvas ({blocks.length} Blocks)
            </h3>
            <p className="mt-1 text-step-sm text-ink-2">
              Drag & drop blocks to rearrange, customize properties, and upload media directly to Cloudflare R2.
            </p>
          </div>

          {/* Custom Styled Add Block Dropdown (Zero native select bugs) */}
          <BlockSelectorDropdown onSelectBlock={addBlock} />
        </div>

        {/* Blocks Reorderable Drag & Drop List */}
        <div className="space-y-3">
          {blocks.length === 0 ? (
            <div className="p-8 rounded-sm border-2 border-dashed border-line text-center space-y-2">
              <Layers aria-hidden className="w-8 h-8 text-ink-3 mx-auto" />
              <p className="text-step-sm text-ink-2">No blocks in canvas yet. Click &quot;Add Block&quot; above to get started.</p>
            </div>
          ) : (
            blocks.map((block, index) => (
              <BlockItemCard
                key={block.id}
                block={block}
                index={index}
                totalBlocks={blocks.length}
                onUpdateBlock={updateBlock}
                onRemoveBlock={removeBlock}
                onMoveBlock={moveBlock}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragOver={dragOverIndex === index && draggedIndex !== index}
              />
            ))
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-line">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleSaveDraft}
            disabled={loading}
            variant="outline"
            className="gap-2"
          >
            <Save aria-hidden className="w-4 h-4 text-primary" />
            {loading ? 'Saving...' : 'Save Draft'}
          </Button>

          <Button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            variant="outline"
            className="gap-2"
          >
            <Eye aria-hidden className="w-4 h-4" />
            Live Preview
          </Button>

          <Button
            onClick={handleSubmitForVerification}
            disabled={loading}
            aria-describedby="studio-checkout-note"
            className="gap-2"
          >
            <Send aria-hidden className="w-4 h-4" />
            {loading ? 'Processing...' : 'Pay & Submit for Review'}
          </Button>

          {slug && (
            <Button asChild variant="ghost" className="gap-2">
              <Link href={`/studio/products/${normalizeStudioSlug(slug)}/preview`} target="_blank">
                <ExternalLink aria-hidden className="w-4 h-4" />
                Dedicated Preview Page
                <span className="sr-only">(opens in a new tab)</span>
              </Link>
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowJson(!showJson)}
          aria-expanded={showJson}
          className="gap-1.5"
        >
          <Code2 aria-hidden className="w-3.5 h-3.5" />
          {showJson ? 'Hide Block Schema JSON' : 'Inspect Block Schema JSON'}
        </Button>
      </div>

      <p id="studio-checkout-note" className="text-step-xs text-ink-3">
        Submitting saves your draft first. When payment is required, you continue to Polar checkout, which shows the final price before you pay. Polar is the merchant of record.
      </p>

      {/* JSON Schema Viewer */}
      {showJson && (
        <div className="mt-4 p-4 rounded-sm bg-canvas-deep border border-line font-mono text-step-xs text-foreground overflow-x-auto">
          <pre>
            {JSON.stringify(
              documentJson,
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Instant Interactive Live Preview Modal */}
      <StudioPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={title}
        tagline={tagline}
        logoUrl={logoUrl}
        websiteUrl={websiteUrl}
        slug={slug}
        blocks={blocks}
        onPublishOrSubmit={handleSubmitForVerification}
        isSubmitting={loading}
      />
    </Card>
  );
}
