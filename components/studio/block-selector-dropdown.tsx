'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        className="rounded-xl gap-2 text-xs font-semibold bg-white/[0.04] border-white/10 hover:border-primary/40 hover:bg-primary/10 text-foreground transition-all shadow-sm"
      >
        <Plus className="w-3.5 h-3.5 text-primary" />
        <span>Add Block ({AVAILABLE_BLOCKS.length} Types)</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {/* Custom Styled Dark Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[340px] sm:w-[400px] max-h-[500px] rounded-2xl bg-[#0B101B] border border-white/15 text-slate-100 shadow-2xl z-50 overflow-hidden flex flex-col backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
          {/* Header & Filter Tabs */}
          <div className="p-3 border-b border-white/10 space-y-2 bg-black/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Select Block Type
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
              {(['All', 'Structure', 'Trust & Proof', 'Engagement'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                    activeCategory === cat
                      ? 'bg-primary text-primary-foreground font-bold'
                      : 'bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Block Options Scroll List */}
          <div className="overflow-y-auto p-2 space-y-1 divide-y divide-white/5 max-h-[380px]">
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
                  className="w-full p-2.5 rounded-xl text-left flex items-start gap-3 hover:bg-white/[0.06] transition-all group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform">
                    <IconComponent className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-100 group-hover:text-primary transition-colors truncate">
                        {option.label}
                      </span>
                      {option.badge && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-primary/30 bg-primary/10 text-primary font-mono shrink-0"
                        >
                          {option.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1 leading-normal">
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
