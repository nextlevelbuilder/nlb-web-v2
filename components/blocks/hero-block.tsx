import React from "react";
import type { HeroBlock } from "@/packages/contracts/src";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function HeroBlockView({ block }: { block: HeroBlock }) {
  const { headline, subheadline, primaryCtaText, primaryCtaUrl, badge } = block.props;

  return (
    <section className="surface-panel flex flex-col items-center px-6 py-12 text-center">
      {badge && (
        <Badge className="mb-4">
          {badge}
        </Badge>
      )}
      {/* The product page owns the h1; block headlines start at h2. */}
      <h2 className="mb-4 max-w-3xl break-words font-display text-step-3xl font-light text-foreground">
        {headline}
      </h2>
      {subheadline && (
        <p className="lede mb-8 max-w-2xl">
          {subheadline}
        </p>
      )}
      {primaryCtaText && primaryCtaUrl && (
        <Button asChild size="lg" className="gap-2">
          <Link href={primaryCtaUrl} target="_blank" rel="noopener noreferrer">
            {primaryCtaText}
            <ArrowRight aria-hidden className="w-4 h-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        </Button>
      )}
    </section>
  );
}
