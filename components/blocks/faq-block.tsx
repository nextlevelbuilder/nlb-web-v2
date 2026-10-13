import React from "react";
import type { Block } from "@/packages/contracts/src";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function FaqBlockView({ block }: { block: Extract<Block, { type: "faq" }> }) {
  const { items } = block.props;

  return (
    <div className="w-full max-w-3xl mx-auto my-6">
      <Accordion type="single" collapsible className="w-full space-y-4">
        {items.map((item, index) => (
          <AccordionItem
            key={index}
            value={`item-${index}`}
            className="border border-white/10 bg-white/[0.02] rounded-xl px-6"
          >
            <AccordionTrigger className="text-left font-semibold text-foreground py-4 hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
