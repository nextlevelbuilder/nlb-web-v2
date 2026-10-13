import React from "react";
import type { CtaBlock } from "@/packages/contracts/src";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function CtaBlockView({ block }: { block: CtaBlock }) {
  const { title, subtitle, buttonText, buttonUrl } = block.props;

  return (
    <div className="flex flex-col items-center text-center p-12 rounded-3xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border border-primary/30 my-8 shadow-2xl">
      <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">{title}</h2>
      {subtitle && <p className="text-muted-foreground text-lg max-w-xl mb-6">{subtitle}</p>}
      <Button asChild size="lg" className="rounded-full shadow-lg gap-2 text-base px-8 py-6">
        <Link href={buttonUrl} target="_blank" rel="noopener noreferrer">
          {buttonText}
          <ArrowRight className="w-5 h-5" />
        </Link>
      </Button>
    </div>
  );
}
