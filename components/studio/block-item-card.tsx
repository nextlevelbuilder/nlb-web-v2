'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GripVertical,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  LayoutGrid,
  Image as ImageIcon,
  Layers,
  Cpu,
  Flag,
  ShieldCheck,
  User,
  Quote,
  BookOpen,
  Video,
  DollarSign,
  HelpCircle,
  History,
  MapPin,
  Send,
  Plus,
} from 'lucide-react';
import type { Block } from '@nextlevelbuilder/contracts';
import MediaUploadDropzone from './media-upload-dropzone';
import ActivityPulseEditor from './activity-pulse-editor';

export interface BlockItemCardProps {
  block: Block;
  index: number;
  totalBlocks: number;
  onUpdateBlock: (index: number, updated: Block) => void;
  onRemoveBlock: (index: number) => void;
  onMoveBlock: (index: number, direction: 'up' | 'down') => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop?: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragOver?: boolean;
}

export default function BlockItemCard({
  block,
  index,
  totalBlocks,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver = false,
}: BlockItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper to update props
  // Callers pass fields of the current block's own props; the cast re-asserts the discriminated union.
  const updateProps = (newProps: Record<string, unknown>) => {
    onUpdateBlock(index, {
      ...block,
      props: {
        ...block.props,
        ...newProps,
      },
    } as Block);
  };

  // Icon & color by block type
  const getBlockMeta = (type: Block['type']) => {
    switch (type) {
      case 'analytics':
        return { icon: BarChart3, color: 'text-primary', badgeClass: 'bg-primary/10 border-primary/40 text-primary' };
      case 'hero':
        return { icon: Sparkles, color: 'text-warning', badgeClass: 'bg-warning/10 border-warning/40 text-warning' };
      case 'grid':
        return { icon: LayoutGrid, color: 'text-primary', badgeClass: 'bg-primary/10 border-primary/40 text-primary' };
      case 'mediaGallery':
        return { icon: ImageIcon, color: 'text-success', badgeClass: 'bg-success/10 border-success/40 text-success' };
      case 'carousel':
        return { icon: Layers, color: 'text-ink-2', badgeClass: 'bg-surface-raised border-line-strong text-ink-2' };
      case 'techStack':
        return { icon: Cpu, color: 'text-ink-2', badgeClass: 'bg-surface-raised border-line-strong text-ink-2' };
      case 'liveDemo':
        return { icon: Video, color: 'text-destructive', badgeClass: 'bg-destructive/10 border-destructive/40 text-destructive' };
      case 'pricing':
        return { icon: DollarSign, color: 'text-success', badgeClass: 'bg-success/10 border-success/40 text-success' };
      case 'faq':
        return { icon: HelpCircle, color: 'text-ink-2', badgeClass: 'bg-surface-raised border-line-strong text-ink-2' };
      case 'founder':
        return { icon: User, color: 'text-primary', badgeClass: 'bg-primary/10 border-primary/40 text-primary' };
      case 'verification':
        return { icon: ShieldCheck, color: 'text-success', badgeClass: 'bg-success/10 border-success/40 text-success' };
      case 'quote':
        return { icon: Quote, color: 'text-ink-2', badgeClass: 'bg-surface-raised border-line-strong text-ink-2' };
      case 'caseStudy':
        return { icon: BookOpen, color: 'text-ink-2', badgeClass: 'bg-surface-raised border-line-strong text-ink-2' };
      case 'milestones':
        return { icon: Flag, color: 'text-warning', badgeClass: 'bg-warning/10 border-warning/40 text-warning' };
      case 'changelog':
        return { icon: History, color: 'text-ink-2', badgeClass: 'bg-surface-raised border-line-strong text-ink-2' };
      case 'roadmap':
        return { icon: MapPin, color: 'text-ink-2', badgeClass: 'bg-surface-raised border-line-strong text-ink-2' };
      case 'cta':
        return { icon: Send, color: 'text-primary', badgeClass: 'bg-primary/10 border-primary/30 text-primary' };
      default:
        return { icon: Sparkles, color: 'text-primary', badgeClass: 'bg-primary/10 border-primary/30 text-primary' };
    }
  };

  const meta = getBlockMeta(block.type);
  const IconComponent = meta.icon;
  // Unique, stable prefix for label/field associations within this block card.
  const fieldPrefix = `block-${block.id}`;

  // Render quick summary text based on block type
  const getSummary = () => {
    switch (block.type) {
      case 'analytics':
        return `${block.props.title} · Last ${block.props.period.slice(0, -1)} days`;
      case 'activities':
        return block.props.entries.length + ' Activity Updates';
      case 'pulse':
        return 'Measured website health';
      case 'hero':
        return block.props.headline || 'Hero Section';
      case 'grid':
        return `${block.props.items?.length || 0} Features (${block.props.columns || 3} cols)`;
      case 'mediaGallery':
        return `${block.props.images?.length || 0} Gallery Images`;
      case 'carousel':
        return `${block.props.items?.length || 0} Showcase Slides`;
      case 'techStack':
        return `${block.props.technologies?.length || 0} Technologies`;
      case 'liveDemo':
        return block.props.embedUrl ? `Embed: ${block.props.embedUrl}` : 'Interactive Demo';
      case 'pricing':
        return `${block.props.tiers?.length || 0} Pricing Tiers`;
      case 'faq':
        return `${block.props.items?.length || 0} Questions`;
      case 'founder':
        return `${block.props.name || 'Founder'} Bio`;
      case 'verification':
        return `${block.props.metricType || 'Metric'}: ${block.props.verifiedValue || 'Verified'}`;
      case 'quote':
        return `"${block.props.quote?.slice(0, 35)}..." - ${block.props.author || ''}`;
      case 'milestones':
        return `${block.props.items?.length || 0} Timeline Milestones`;
      case 'cta':
        return block.props.title || 'Call to Action';
      case 'changelog':
        return `${block.props.entries?.length || 0} Changelog Entries`;
      case 'roadmap':
        return `${block.props.milestones?.length || 0} Roadmap Milestones`;
      case 'caseStudy':
        return `Case Study: ${block.props.customerName || 'Customer'}`;
      default:
        return (block as { id?: string }).id || 'Custom Block';
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={(event) => onDrop?.(event, index)}
      className={`rounded-sm border transition-colors duration-base ${
        isDragOver
          ? 'border-primary bg-primary/10'
          : 'bg-surface border-line hover:border-line-strong'
      }`}
    >
      {/* Block Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* Drag Handle */}
          <div
            aria-hidden
            title="Drag to reorder"
            className="shrink-0 cursor-grab rounded-sm p-1 text-ink-3 transition-colors hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          <span className="w-6 shrink-0 font-mono text-step-xs text-ink-3">#{index + 1}</span>

          {/* Type Badge */}
          <Badge variant="outline" className={`shrink-0 gap-1 normal-case ${meta.badgeClass}`}>
            <IconComponent aria-hidden className="w-3 h-3" />
            {block.type}
          </Badge>

          {/* Visual Summary */}
          <span className="min-w-0 truncate text-step-sm text-foreground">{getSummary()}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse block ${index + 1}` : `Customize block ${index + 1}`}
            className="h-10 gap-1 px-2.5"
          >
            {isExpanded ? (
              <>
                <ChevronUp aria-hidden className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Collapse</span>
              </>
            ) : (
              <>
                <ChevronDown aria-hidden className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Customize</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMoveBlock(index, 'up')}
            aria-label={`Move block ${index + 1} up`}
            className="h-10 w-10 p-0"
          >
            <ArrowUp aria-hidden className="w-3.5 h-3.5" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={index === totalBlocks - 1}
            onClick={() => onMoveBlock(index, 'down')}
            aria-label={`Move block ${index + 1} down`}
            className="h-10 w-10 p-0"
          >
            <ArrowDown aria-hidden className="w-3.5 h-3.5" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onRemoveBlock(index)}
            aria-label={`Delete block ${index + 1}`}
            className="h-10 w-10 p-0 hover:text-destructive"
          >
            <Trash2 aria-hidden className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Expandable Customizer & Visual Preview */}
      {isExpanded && (
        <div className="space-y-4 border-t border-line bg-surface-raised p-4 text-step-sm">
          {(block.type === 'activities' || block.type === 'pulse') && <ActivityPulseEditor block={block} onChange={(updated) => onUpdateBlock(index, updated)} />}
          {/* HERO BLOCK CUSTOMIZER */}
          {block.type === 'hero' && (
            <div className="space-y-3">
              <div>
                <label htmlFor={`${fieldPrefix}-headline`} className="mono-label text-ink-3">Headline</label>
                <input
                  id={`${fieldPrefix}-headline`}
                  type="text"
                  value={block.props.headline || ''}
                  onChange={(e) => updateProps({ headline: e.target.value })}
                  placeholder="Compelling product title"
                  className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label htmlFor={`${fieldPrefix}-subheadline`} className="mono-label text-ink-3">Subheadline</label>
                <textarea
                  id={`${fieldPrefix}-subheadline`}
                  value={block.props.subheadline || ''}
                  onChange={(e) => updateProps({ subheadline: e.target.value })}
                  placeholder="One or two sentences explaining the core value"
                  rows={2}
                  className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${fieldPrefix}-button-text`} className="mono-label text-ink-3">Button Text</label>
                  <input
                    id={`${fieldPrefix}-button-text`}
                    type="text"
                    value={block.props.primaryCtaText || ''}
                    onChange={(e) => updateProps({ primaryCtaText: e.target.value })}
                    placeholder="Get Started"
                    className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldPrefix}-button-url`} className="mono-label text-ink-3">Button URL</label>
                  <input
                    id={`${fieldPrefix}-button-url`}
                    type="url"
                    value={block.props.primaryCtaUrl || ''}
                    onChange={(e) => updateProps({ primaryCtaUrl: e.target.value })}
                    placeholder="https://yourproduct.com"
                    className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {block.type === 'analytics' && (
            <div className="space-y-3">
              <div>
                <label htmlFor={`analytics-title-${block.id}`} className="mono-label text-ink-3">Title</label>
                <input
                  id={`analytics-title-${block.id}`}
                  type="text"
                  value={block.props.title}
                  minLength={1}
                  maxLength={100}
                  onChange={(e) => updateProps({ title: e.target.value })}
                  className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label htmlFor={`analytics-period-${block.id}`} className="mono-label text-ink-3">Reporting period</label>
                <select
                  id={`analytics-period-${block.id}`}
                  value={block.props.period}
                  onChange={(e) => updateProps({ period: e.target.value })}
                  className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>
              <p className="text-step-xs text-ink-2">Publishing this block shares aggregate visits and website clicks for this NLB product page. It does not measure your external website. Preview visits are not counted.</p>
            </div>
          )}

          {/* MEDIA GALLERY / CAROUSEL CUSTOMIZER WITH R2 UPLOAD */}
          {(block.type === 'mediaGallery' || block.type === 'carousel') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="mono-label text-ink-3">
                  Images (Uploaded to Cloudflare R2)
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentImages =
                      block.type === 'mediaGallery'
                        ? block.props.images || []
                        : (block.props.items || []).map((i) => ({ url: i.imageUrl, caption: i.title }));
                    const newImage = { url: '', caption: 'New Screenshot' };
                    if (block.type === 'mediaGallery') {
                      updateProps({ images: [...currentImages, newImage] });
                    } else {
                      updateProps({
                        items: [
                          ...(block.props.items || []),
                          { title: 'New Slide', imageUrl: 'https://placehold.co/600x400' },
                        ],
                      });
                    }
                  }}
                  className="gap-1"
                >
                  <Plus aria-hidden className="w-3 h-3 text-primary" />
                  Add Image Slot
                </Button>
              </div>

              {/* List of images with R2 upload */}
              {(block.type === 'mediaGallery' ? block.props.images || [] : block.props.items || []).map(
                (item: { url?: string; imageUrl?: string }, imgIdx: number) => {
                  const url = block.type === 'mediaGallery' ? item.url : item.imageUrl;
                  return (
                    <div key={imgIdx} className="space-y-2 rounded-sm border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-step-xs text-ink-3">Image #{imgIdx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (block.type === 'mediaGallery') {
                              updateProps({
                                images: (block.props.images || []).filter((_: unknown, i: number) => i !== imgIdx),
                              });
                            } else {
                              updateProps({
                                items: (block.props.items || []).filter((_: unknown, i: number) => i !== imgIdx),
                              });
                            }
                          }}
                          aria-label={`Remove image ${imgIdx + 1}`}
                          className="h-10 w-10 p-0 hover:text-destructive"
                        >
                          <Trash2 aria-hidden className="w-3 h-3" />
                        </Button>
                      </div>

                      <MediaUploadDropzone
                        value={url}
                        onChange={(newUrl) => {
                          if (block.type === 'mediaGallery') {
                            const newImgs = [...(block.props.images || [])];
                            newImgs[imgIdx] = { ...newImgs[imgIdx], url: newUrl };
                            updateProps({ images: newImgs });
                          } else {
                            const newItems = [...(block.props.items || [])];
                            newItems[imgIdx] = { ...newItems[imgIdx], imageUrl: newUrl };
                            updateProps({ items: newItems });
                          }
                        }}
                        label="Upload Asset to Cloudflare R2"
                        folder="screenshots"
                      />
                    </div>
                  );
                }
              )}
            </div>
          )}

          {/* VIDEO / LIVE DEMO CUSTOMIZER WITH R2 UPLOAD */}
          {block.type === 'liveDemo' && (
            <div className="space-y-3">
              <MediaUploadDropzone
                value={block.props.embedUrl}
                onChange={(newUrl) => updateProps({ embedUrl: newUrl })}
                accept="video"
                label="Upload Demo Video to Cloudflare R2"
                folder="videos"
              />
              <div>
                <label htmlFor={`${fieldPrefix}-or-embed-iframe-url`} className="mono-label text-ink-3">Or Embed / Iframe URL</label>
                <input
                  id={`${fieldPrefix}-or-embed-iframe-url`}
                  type="url"
                  value={block.props.embedUrl || ''}
                  onChange={(e) => updateProps({ embedUrl: e.target.value })}
                  placeholder="https://youtube.com/embed/... or https://demo.yourproduct.com"
                  className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          {/* FOUNDER BLOCK CUSTOMIZER WITH AVATAR R2 UPLOAD */}
          {block.type === 'founder' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${fieldPrefix}-founder-name`} className="mono-label text-ink-3">Founder Name</label>
                  <input
                    id={`${fieldPrefix}-founder-name`}
                    type="text"
                    value={block.props.name || ''}
                    onChange={(e) => updateProps({ name: e.target.value })}
                    placeholder="Jane Doe"
                    className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldPrefix}-x-twitter-handle`} className="mono-label text-ink-3">X / Twitter Handle</label>
                  <input
                    id={`${fieldPrefix}-x-twitter-handle`}
                    type="text"
                    value={block.props.xHandle || ''}
                    onChange={(e) => updateProps({ xHandle: e.target.value })}
                    placeholder="builder_jane"
                    className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <MediaUploadDropzone
                value={block.props.avatarUrl}
                onChange={(avatarUrl) => updateProps({ avatarUrl })}
                label="Founder Avatar (Cloudflare R2)"
                folder="logos"
              />
              <div>
                <label htmlFor={`${fieldPrefix}-bio`} className="mono-label text-ink-3">Bio</label>
                <textarea
                  id={`${fieldPrefix}-bio`}
                  value={block.props.bio || ''}
                  onChange={(e) => updateProps({ bio: e.target.value })}
                  placeholder="Building in public with autonomous coding agents..."
                  rows={2}
                  className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          {/* FEATURES GRID CUSTOMIZER */}
          {block.type === 'grid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="mono-label text-ink-3">
                  Feature Cards ({block.props.items?.length || 0})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const items = block.props.items || [];
                    updateProps({
                      items: [...items, { title: `Feature ${items.length + 1}`, description: 'Feature description' }],
                    });
                  }}
                  className="gap-1"
                >
                  <Plus aria-hidden className="w-3 h-3 text-primary" />
                  Add Feature
                </Button>
              </div>

              <div className="space-y-2">
                {(block.props.items || []).map((item, fIdx: number) => (
                  <div key={fIdx} className="space-y-2 rounded-sm border border-line bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => {
                          const newItems = [...block.props.items];
                          newItems[fIdx] = { ...newItems[fIdx], title: e.target.value };
                          updateProps({ items: newItems });
                        }}
                        placeholder="Feature Title"
                        aria-label={`Feature ${fIdx + 1} title`}
                        className="min-w-0 flex-1 rounded-sm border border-input bg-surface px-2.5 py-1.5 text-step-sm font-medium text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateProps({
                            items: block.props.items.filter((_: unknown, i: number) => i !== fIdx),
                          });
                        }}
                        aria-label={`Remove feature ${fIdx + 1}`}
                        className="h-10 w-10 p-0 hover:text-destructive"
                      >
                        <Trash2 aria-hidden className="w-3 h-3" />
                      </Button>
                    </div>
                    <textarea
                      value={item.description}
                      onChange={(e) => {
                        const newItems = [...block.props.items];
                        newItems[fIdx] = { ...newItems[fIdx], description: e.target.value };
                        updateProps({ items: newItems });
                      }}
                      placeholder="Brief benefit description"
                      aria-label={`Feature ${fIdx + 1} description`}
                      rows={2}
                      className="w-full rounded-sm border border-input bg-surface px-2.5 py-1.5 text-step-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TECH STACK CUSTOMIZER */}
          {block.type === 'techStack' && (
            <div className="space-y-2">
              <span className="mono-label text-ink-3">Technologies</span>
              <div className="flex flex-wrap gap-1.5 rounded-sm border border-line bg-surface p-2">
                {(block.props.technologies || []).map((t, tIdx: number) => (
                  <Badge key={tIdx} variant="outline" className="gap-1.5 normal-case">
                    {t.name}
                    <button
                      type="button"
                      onClick={() => {
                        updateProps({
                          technologies: block.props.technologies.filter((_: unknown, i: number) => i !== tIdx),
                        });
                      }}
                      aria-label={`Remove ${t.name}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 aria-hidden className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* FAQ CUSTOMIZER */}
          {block.type === 'faq' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="mono-label text-ink-3">
                  Questions & Answers ({block.props.items?.length || 0})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const items = block.props.items || [];
                    updateProps({
                      items: [...items, { question: 'New Question', answer: 'Clear answer to this question.' }],
                    });
                  }}
                  className="gap-1"
                >
                  <Plus aria-hidden className="w-3 h-3 text-primary" />
                  Add FAQ Item
                </Button>
              </div>

              {(block.props.items || []).map((item, qIdx: number) => (
                <div key={qIdx} className="space-y-2 rounded-sm border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={item.question}
                      onChange={(e) => {
                        const newItems = [...block.props.items];
                        newItems[qIdx] = { ...newItems[qIdx], question: e.target.value };
                        updateProps({ items: newItems });
                      }}
                      placeholder="Question"
                      aria-label={`Question ${qIdx + 1}`}
                      className="min-w-0 flex-1 rounded-sm border border-input bg-surface px-2.5 py-1.5 text-step-sm font-medium text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        updateProps({
                          items: block.props.items.filter((_: unknown, i: number) => i !== qIdx),
                        });
                      }}
                      aria-label={`Remove question ${qIdx + 1}`}
                      className="h-10 w-10 p-0 hover:text-destructive"
                    >
                      <Trash2 aria-hidden className="w-3 h-3" />
                    </Button>
                  </div>
                  <textarea
                    value={item.answer}
                    onChange={(e) => {
                      const newItems = [...block.props.items];
                      newItems[qIdx] = { ...newItems[qIdx], answer: e.target.value };
                      updateProps({ items: newItems });
                    }}
                    placeholder="Answer"
                    aria-label={`Answer ${qIdx + 1}`}
                    rows={2}
                    className="w-full rounded-sm border border-input bg-surface px-2.5 py-1.5 text-step-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
