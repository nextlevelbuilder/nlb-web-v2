import React from "react";
import type { HeroBlock } from "@/packages/contracts/src";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function HeroBlockView({ block }: { block: HeroBlock }) {
  const { headline, subheadline, primaryCtaText, primaryCtaUrl, badge } = block.props;

  return (
    <div className="flex flex-col items-center text-center py-12 px-6 rounded-2xl bg-gradient-to-b from-primary/10 via-background to-background border border-white/10">
      {badge && (
        <Badge variant="outline" className="mb-4 text-xs font-medium px-3 py-1 border-primary/40 bg-primary/10">
          {badge}
        </Badge>
      )}
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground max-w-3xl mb-4">
        {headline}
      </h1>
      {subheadline && (
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-8">
          {subheadline}
        </p>
      )}
      {primaryCtaText && primaryCtaUrl && (
        <Button asChild size="lg" className="rounded-full shadow-lg gap-2">
          <Link href={primaryCtaUrl} target="_blank" rel="noopener noreferrer">
            {primaryCtaText}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}
