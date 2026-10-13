'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface TcModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  loading: boolean;
}

interface TcSection {
  heading: string;
  summary: string;
  link: string;
  policyKey: string;
}

interface PolicySection {
  heading: string;
  content: string;
}

interface PolicyData {
  title: string;
  sections: PolicySection[];
}

export default function TcModal({ open, onOpenChange, onAccept, loading }: TcModalProps) {
  const t = useTranslations('tc');
  const p = useTranslations('policies');
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Detect when user scrolls to the bottom of content
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (isAtBottom) setHasScrolledToEnd(true);
  }, []);

  // Reset scroll state when modal closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setHasScrolledToEnd(false);
    onOpenChange(isOpen);
  };

  const sections = t.raw('sections') as TcSection[];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-xl">{t('title')}</DialogTitle>
        </DialogHeader>

        {/* Scrollable T&C content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-4 min-h-0"
          onScroll={handleScroll}
        >
          <div className="space-y-6">
            {sections.map((section, index) => {
              const policy = p.raw(section.policyKey) as PolicyData;

              return (
                <div key={index} className="border border-border/50 rounded-lg px-4 py-3 space-y-4">
                  <h3 className="font-semibold text-foreground text-sm">
                    {index + 1}. {section.heading}
                  </h3>
                  {policy.sections.map((sub, i) => (
                    <div key={i}>
                      <h4 className="text-xs font-semibold text-foreground mb-1.5">
                        {sub.heading}
                      </h4>
                      <ContentRenderer content={sub.content} />
                    </div>
                  ))}
                  <Link
                    href={section.link}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {t('readFull')}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              );
            })}

            {/* Agreement clause */}
            <div className="pt-4 border-t border-border/50">
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {t('agreement')}
              </p>
            </div>
          </div>
        </div>

        {/* Action footer */}
        <div className="px-6 py-4 border-t border-border/50 space-y-2">
          <Button
            onClick={onAccept}
            disabled={!hasScrolledToEnd || loading}
            className="w-full h-11 font-semibold"
          >
            {loading ? 'Processing...' : t('proceed')}
          </Button>
          {!hasScrolledToEnd && (
            <p className="text-xs text-muted-foreground text-center">
              {t('scrollHint')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Renders policy content: supports \n line breaks and • bullet points
function ContentRenderer({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-0.5 text-xs text-muted-foreground leading-relaxed">
      {lines.map((line, i) => {
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        if (line.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-1.5 pl-2">
              <span className="text-primary flex-shrink-0">•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
