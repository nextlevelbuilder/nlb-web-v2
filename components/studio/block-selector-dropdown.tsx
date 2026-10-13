'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Plus,
  BarChart3,
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
  ChevronDown,
  X,
} from 'lucide-react';
import type { Block } from '@/packages/contracts/src';

export type BlockType = Block['type'];

export interface BlockOption {
  type: BlockType;
  label: string;
  category: 'Structure' | 'Trust & Proof' | 'Engagement';
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const AVAILABLE_BLOCKS: BlockOption[] = [
  // 1. Structure
  {
    type: 'hero',
    label: 'Hero Section',
    category: 'Structure',
    description: 'High-impact headline, tagline, and primary conversion action.',
    icon: Sparkles,
    badge: 'Popular',
  },
  {
    type: 'grid',
    label: 'Features Grid',
    category: 'Structure',
    description: '1 to 3 columns grid displaying key capabilities and benefits.',
    icon: LayoutGrid,
    badge: 'Core',
  },
  {
    type: 'mediaGallery',
    label: 'Media Gallery',
    category: 'Structure',
    description: 'High-res screenshots and image gallery hosted on Cloudflare R2.',
    icon: ImageIcon,
    badge: 'Media',
  },
  {
    type: 'carousel',
    label: 'Carousel Showcase',
    category: 'Structure',
    description: 'Horizontal sliding showcase for product workflows and previews.',
    icon: Layers,
  },
  {
    type: 'techStack',
    label: 'Tech Stack',
    category: 'Structure',
    description: 'Interactive badges and categorization of modern tools and frameworks.',
    icon: Cpu,
  },
  {
    type: 'milestones',
    label: 'Milestones Timeline',
    category: 'Structure',
    description: 'Chronological timeline of product launches and major milestones.',
    icon: Flag,
  },

  { type: 'activities', label: 'Activities', category: 'Engagement', description: 'Dated product updates, displayed newest first.', icon: History },
  { type: 'pulse', label: 'Pulse', category: 'Trust & Proof', description: 'Measured website availability and response history.', icon: ShieldCheck },

  // 2. Trust & Proof
  {
    type: 'analytics',
    label: 'Analytics',
    category: 'Trust & Proof',
    description: 'Share real traffic totals for your published NLB product page.',
    icon: BarChart3,
  },
  {
    type: 'verification',
    label: 'Trust & Verification Claims',
    category: 'Trust & Proof',
    description: 'Human-reviewed metrics (revenue, preorders, users, uptime).',
    icon: ShieldCheck,
    badge: 'High Trust',
  },
  {
    type: 'founder',
    label: 'Founder Bio & Story',
    category: 'Trust & Proof',
    description: 'Authentic founder identity, background, and social verification.',
    icon: User,
  },
  {
    type: 'quote',
    label: 'Testimonial / Quote',
    category: 'Trust & Proof',
    description: 'Verified endorsement or customer feedback quotation.',
    icon: Quote,
  },
  {
    type: 'caseStudy',
    label: 'Case Study',
    category: 'Trust & Proof',
    description: 'Problem, solution, and measurable outcome story from real users.',
    icon: BookOpen,
  },

  // 3. Engagement & Conversion
  {
    type: 'liveDemo',
    label: 'Interactive / Video Demo',
    category: 'Engagement',
    description: 'Embedded interactive iframe sandbox or video hosted on R2.',
    icon: Video,
    badge: 'Rich Media',
  },
  {
    type: 'pricing',
    label: 'Pricing Tiers',
    category: 'Engagement',
    description: 'Transparent pricing matrix with early-bird and subscription tiers.',
    icon: DollarSign,
  },
  {
    type: 'faq',
    label: 'FAQ Accordion',
    category: 'Engagement',
    description: 'Interactive collapsible answers to common buyer questions.',
    icon: HelpCircle,
  },
  {
    type: 'changelog',
    label: 'Changelog / Releases',
    category: 'Engagement',
    description: 'Version history, release notes, and latest product improvements.',
    icon: History,
  },
  {
    type: 'roadmap',
    label: 'Product Roadmap',
    category: 'Engagement',
    description: 'Planned, in-progress, and completed quarterly features.',
    icon: MapPin,
  },
  {
    type: 'cta',
    label: 'Call to Action',
    category: 'Engagement',
    description: 'Final bottom conversion banner with direct link or signup button.',
    icon: Send,
  },
];

interface BlockSelectorDropdownProps {
  onSelectBlock: (type: BlockType) => void;
  disabled?: boolean;
}

export default function BlockSelectorDropdown({
  onSelectBlock,
  disabled = false,
}: BlockSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'All' | 'Structure' | 'Trust & Proof' | 'Engagement'>('All');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const filteredBlocks =
    activeCategory === 'All'
      ? AVAILABLE_BLOCKS
      : AVAILABLE_BLOCKS.filter((b) => b.category === activeCategory);

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="block-selector-panel"
        className="gap-2"
      >
        <Plus aria-hidden className="w-3.5 h-3.5 text-primary" />
        <span>Add Block ({AVAILABLE_BLOCKS.length} Types)</span>
        <ChevronDown aria-hidden className={`w-3.5 h-3.5 text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {/* Custom Styled Dark Dropdown Popover */}
      {isOpen && (
        <div id="block-selector-panel" role="dialog" aria-label="Select block type" className="absolute left-0 z-50 mt-2 flex max-h-[500px] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-sm border border-line-strong bg-surface text-foreground shadow-constellation sm:left-auto sm:right-0">
          {/* Header & Filter Tabs */}
          <div className="p-3 border-b border-line space-y-2 bg-canvas-deep">
            <div className="flex items-center justify-between">
              <span className="mono-label flex items-center gap-1.5 text-foreground">
                <Sparkles aria-hidden className="w-3.5 h-3.5 text-primary" />
                Select Block Type
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close block list"
                className="inline-flex h-10 w-10 items-center justify-center rounded-sm text-ink-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="w-4 h-4" />
              </button>
            </div>

            {/* Category Filter Pills */}
            <div role="group" aria-label="Block category" className="flex items-center gap-1 overflow-x-auto pb-1 text-step-xs">
              {(['All', 'Structure', 'Trust & Proof', 'Engagement'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`min-h-9 shrink-0 rounded-pill px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeCategory === cat
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-raised text-ink-2 hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Block Options Scroll List */}
          <div className="max-h-[380px] space-y-1 divide-y divide-line overflow-y-auto p-2">
            {filteredBlocks.map((option) => {
              const IconComponent = option.icon;
              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => {
                    onSelectBlock(option.type);
                    setIsOpen(false);
                  }}
                  className="group flex w-full cursor-pointer items-start gap-3 rounded-sm p-2.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-line text-primary">
                    <IconComponent className="w-4 h-4" />
                  </span>

                  <span className="block min-w-0 flex-1 space-y-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-step-sm font-medium text-foreground transition-colors group-hover:text-primary">
                        {option.label}
                      </span>
                      {option.badge && (
                        <span className={cn(badgeVariants({ variant: 'outline' }), 'shrink-0')}>{option.badge}</span>
                      )}
                    </span>
                    <span className="block line-clamp-1 text-step-xs leading-normal text-ink-2">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
