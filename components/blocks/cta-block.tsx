import React from "react";
import type { CtaBlock } from "@/packages/contracts/src";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function CtaBlockView({ block }: { block: CtaBlock }) {
  const { title, subtitle, buttonText, buttonUrl } = block.props;

  return (
    <section className="surface-panel my-8 flex flex-col items-center p-8 text-center shadow-constellation sm:p-12">
      <h2 className="h-section mb-3 break-words">{title}</h2>
      {subtitle && <p className="lede mb-6 max-w-xl">{subtitle}</p>}
      <Button asChild size="lg" className="gap-2">
        <Link href={buttonUrl} target="_blank" rel="noopener noreferrer">
          {buttonText}
          <ArrowRight aria-hidden className="w-5 h-5" />
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
      </Button>
    </section>
  );
}
