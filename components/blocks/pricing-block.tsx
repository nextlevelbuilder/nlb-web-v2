import React from "react";
import type { PricingBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import Link from "next/link";

export function PricingBlockView({ block }: { block: PricingBlock }) {
  const { tiers } = block.props;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full my-6">
      {tiers.map((tier, index) => (
        <Card
          key={index}
          className={`relative flex flex-col p-8 rounded-sm border ${
            tier.isPopular ? "border-primary bg-primary/[0.03]" : "border-line bg-surface"
          }`}
        >
          {tier.isPopular && (
            <Badge className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5">
              Popular
            </Badge>
          )}
          <div className="mb-6">
            <h3 className="font-display text-step-xl text-foreground mb-2">{tier.name}</h3>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-display font-light tracking-tight text-foreground">{tier.price}</span>
              {tier.period && <span className="text-sm text-ink-2">/{tier.period}</span>}
            </div>
          </div>

          <ul className="flex-1 space-y-3 mb-8">
            {tier.features.map((feature, fIndex) => (
              <li key={fIndex} className="flex items-center gap-3 text-sm text-ink-2">
                <Check className="w-4 h-4 text-primary shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          {tier.ctaUrl ? (
            <Button asChild className="w-full rounded-sm" variant={tier.isPopular ? "default" : "outline"}>
              <Link href={tier.ctaUrl} target="_blank" rel="noopener noreferrer">
                {tier.ctaText}
              </Link>
            </Button>
          ) : (
            <Button className="w-full rounded-sm" variant={tier.isPopular ? "default" : "outline"}>
              {tier.ctaText}
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
