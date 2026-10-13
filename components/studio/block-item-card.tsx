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
  Eye,
  Plus,
} from 'lucide-react';
import type { Block } from '@/packages/contracts/src';
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
  const updateProps = (newProps: Partial<any>) => {
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
        return { icon: BarChart3, color: 'text-sky-400', badgeClass: 'bg-sky-500/10 border-sky-500/30 text-sky-400' };
      case 'hero':
        return { icon: Sparkles, color: 'text-amber-400', badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400' };
      case 'grid':
        return { icon: LayoutGrid, color: 'text-cyan-400', badgeClass: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' };
      case 'mediaGallery':
        return { icon: ImageIcon, color: 'text-emerald-400', badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' };
      case 'carousel':
        return { icon: Layers, color: 'text-blue-400', badgeClass: 'bg-blue-500/10 border-blue-500/30 text-blue-400' };
      case 'techStack':
        return { icon: Cpu, color: 'text-purple-400', badgeClass: 'bg-purple-500/10 border-purple-500/30 text-purple-400' };
      case 'liveDemo':
        return { icon: Video, color: 'text-rose-400', badgeClass: 'bg-rose-500/10 border-rose-500/30 text-rose-400' };
      case 'pricing':
        return { icon: DollarSign, color: 'text-emerald-400', badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' };
      case 'faq':
        return { icon: HelpCircle, color: 'text-teal-400', badgeClass: 'bg-teal-500/10 border-teal-500/30 text-teal-400' };
      case 'founder':
        return { icon: User, color: 'text-sky-400', badgeClass: 'bg-sky-500/10 border-sky-500/30 text-sky-400' };
      case 'verification':
        return { icon: ShieldCheck, color: 'text-emerald-400', badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' };
      case 'quote':
        return { icon: Quote, color: 'text-indigo-400', badgeClass: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' };
      case 'caseStudy':
        return { icon: BookOpen, color: 'text-orange-400', badgeClass: 'bg-orange-500/10 border-orange-500/30 text-orange-400' };
      case 'milestones':
        return { icon: Flag, color: 'text-yellow-400', badgeClass: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' };
      case 'changelog':
        return { icon: History, color: 'text-lime-400', badgeClass: 'bg-lime-500/10 border-lime-500/30 text-lime-400' };
      case 'roadmap':
        return { icon: MapPin, color: 'text-fuchsia-400', badgeClass: 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400' };
      case 'cta':
        return { icon: Send, color: 'text-primary', badgeClass: 'bg-primary/10 border-primary/30 text-primary' };
      default:
        return { icon: Sparkles, color: 'text-primary', badgeClass: 'bg-primary/10 border-primary/30 text-primary' };
    }
  };

  const meta = getBlockMeta(block.type);
  const IconComponent = meta.icon;

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
        return (block as any).id || 'Custom Block';
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={(event) => onDrop?.(event, index)}
      className={`rounded-2xl border transition-all ${
        isDragOver
          ? 'border-primary bg-primary/10 scale-[1.01] shadow-lg shadow-primary/20'
          : 'bg-black/40 border-white/10 hover:border-white/20'
      }`}
    >
      {/* Block Header Row */}
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Drag Handle */}
          <div
            title="Drag to reorder"
            className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground p-1 rounded-md transition-colors shrink-0"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          <span className="font-mono text-xs text-muted-foreground w-5 shrink-0">#{index + 1}</span>

          {/* Type Badge */}
          <Badge variant="outline" className={`text-xs font-mono capitalize gap-1 shrink-0 ${meta.badgeClass}`}>
            <IconComponent className="w-3 h-3" />
            {block.type}
          </Badge>

          {/* Visual Summary */}
          <span className="text-xs font-medium text-foreground truncate">{getSummary()}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1 rounded-lg"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Collapse</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
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
            title="Move Up"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={index === totalBlocks - 1}
            onClick={() => onMoveBlock(index, 'down')}
            title="Move Down"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onRemoveBlock(index)}
            title="Delete Block"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Expandable Customizer & Visual Preview */}
      {isExpanded && (
        <div className="p-4 border-t border-white/10 bg-white/[0.01] space-y-4 rounded-b-2xl text-xs">
          {(block.type === 'activities' || block.type === 'pulse') && <ActivityPulseEditor block={block} onChange={(updated) => onUpdateBlock(index, updated)} />}
          {/* HERO BLOCK CUSTOMIZER */}
          {block.type === 'hero' && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground font-semibold uppercase">Headline</label>
                <input
                  type="text"
                  value={block.props.headline || ''}
                  onChange={(e) => updateProps({ headline: e.target.value })}
                  placeholder="Compelling product title"
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-semibold uppercase">Subheadline</label>
                <textarea
                  value={block.props.subheadline || ''}
                  onChange={(e) => updateProps({ subheadline: e.target.value })}
                  placeholder="One or two sentences explaining the core value"
                  rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground font-semibold uppercase">Button Text</label>
                  <input
                    type="text"
                    value={block.props.primaryCtaText || ''}
                    onChange={(e) => updateProps({ primaryCtaText: e.target.value })}
                    placeholder="Get Started"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-semibold uppercase">Button URL</label>
                  <input
                    type="url"
                    value={block.props.primaryCtaUrl || ''}
                    onChange={(e) => updateProps({ primaryCtaUrl: e.target.value })}
                    placeholder="https://yourproduct.com"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {block.type === 'analytics' && (
            <div className="space-y-3">
              <div>
                <label htmlFor={`analytics-title-${block.id}`} className="text-[11px] text-muted-foreground font-semibold uppercase">Title</label>
                <input
                  id={`analytics-title-${block.id}`}
                  type="text"
                  value={block.props.title}
                  minLength={1}
                  maxLength={100}
                  onChange={(e) => updateProps({ title: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor={`analytics-period-${block.id}`} className="text-[11px] text-muted-foreground font-semibold uppercase">Reporting period</label>
                <select
                  id={`analytics-period-${block.id}`}
                  value={block.props.period}
                  onChange={(e) => updateProps({ period: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-background border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">Publishing this block shares aggregate visits and website clicks for this NLB product page. It does not measure your external website. Preview visits are not counted.</p>
            </div>
          )}

          {/* MEDIA GALLERY / CAROUSEL CUSTOMIZER WITH R2 UPLOAD */}
          {(block.type === 'mediaGallery' || block.type === 'carousel') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase">
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
                  className="h-7 text-xs gap-1 border-white/10"
                >
                  <Plus className="w-3 h-3 text-primary" />
                  Add Image Slot
                </Button>
              </div>

              {/* List of images with R2 upload */}
              {(block.type === 'mediaGallery' ? block.props.images || [] : block.props.items || []).map(
                (item: any, imgIdx: number) => {
                  const url = block.type === 'mediaGallery' ? item.url : item.imageUrl;
                  return (
                    <div key={imgIdx} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground font-mono">Image #{imgIdx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (block.type === 'mediaGallery') {
                              updateProps({
                                images: (block.props.images || []).filter((_: any, i: number) => i !== imgIdx),
                              });
                            } else {
                              updateProps({
                                items: (block.props.items || []).filter((_: any, i: number) => i !== imgIdx),
                              });
                            }
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
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
                <label className="text-[11px] text-muted-foreground font-semibold uppercase">Or Embed / Iframe URL</label>
                <input
                  type="url"
                  value={block.props.embedUrl || ''}
                  onChange={(e) => updateProps({ embedUrl: e.target.value })}
                  placeholder="https://youtube.com/embed/... or https://demo.yourproduct.com"
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* FOUNDER BLOCK CUSTOMIZER WITH AVATAR R2 UPLOAD */}
          {block.type === 'founder' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground font-semibold uppercase">Founder Name</label>
                  <input
                    type="text"
                    value={block.props.name || ''}
                    onChange={(e) => updateProps({ name: e.target.value })}
                    placeholder="Jane Doe"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-semibold uppercase">X / Twitter Handle</label>
                  <input
                    type="text"
                    value={block.props.xHandle || ''}
                    onChange={(e) => updateProps({ xHandle: e.target.value })}
                    placeholder="builder_jane"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
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
                <label className="text-[11px] text-muted-foreground font-semibold uppercase">Bio</label>
                <textarea
                  value={block.props.bio || ''}
                  onChange={(e) => updateProps({ bio: e.target.value })}
                  placeholder="Building in public with autonomous coding agents..."
                  rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* FEATURES GRID CUSTOMIZER */}
          {block.type === 'grid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase">
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
                  className="h-7 text-xs gap-1 border-white/10"
                >
                  <Plus className="w-3 h-3 text-primary" />
                  Add Feature
                </Button>
              </div>

              <div className="space-y-2">
                {(block.props.items || []).map((item: any, fIdx: number) => (
                  <div key={fIdx} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
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
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-semibold focus:outline-none focus:border-primary"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateProps({
                            items: block.props.items.filter((_: any, i: number) => i !== fIdx),
                          });
                        }}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
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
                      rows={2}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs focus:outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TECH STACK CUSTOMIZER */}
          {block.type === 'techStack' && (
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground font-semibold uppercase">Technologies</label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white/[0.02] border border-white/10">
                {(block.props.technologies || []).map((t: any, tIdx: number) => (
                  <Badge key={tIdx} variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-300 gap-1.5 py-1">
                    {t.name}
                    <button
                      type="button"
                      onClick={() => {
                        updateProps({
                          technologies: block.props.technologies.filter((_: any, i: number) => i !== tIdx),
                        });
                      }}
                      className="hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
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
                <span className="text-[11px] text-muted-foreground font-semibold uppercase">
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
                  className="h-7 text-xs gap-1 border-white/10"
                >
                  <Plus className="w-3 h-3 text-primary" />
                  Add FAQ Item
                </Button>
              </div>

              {(block.props.items || []).map((item: any, qIdx: number) => (
                <div key={qIdx} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
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
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-semibold focus:outline-none focus:border-primary"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        updateProps({
                          items: block.props.items.filter((_: any, i: number) => i !== qIdx),
                        });
                      }}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
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
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs focus:outline-none focus:border-primary"
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
