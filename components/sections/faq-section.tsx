'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqKeys = [
  'whatIsNLB',
  'refundPolicy',
  'timeCommitment',
  'isItACourse',
  'whatWillILearn',
  'needTechnical',
  'technicalLevel',
  'tierIncludes',
  'howDiscordWorks',
  'whatMakesDifferent',
  'upgradePlan',
  'freeTrial',
];

export default function FAQSection() {
  const t = useTranslations('faq');

  return (
    <section id="faq" className="py-section px-6 relative">
      <div className="container mx-auto max-w-3xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-sm font-medium text-primary mb-4 tracking-wide uppercase">
            Questions & Answers
          </span>
          <h2 className="heading-section text-3xl sm:text-h1 lg:text-display-lg text-foreground mb-6">
            {t('title')}
          </h2>
          <p className="text-body-lg text-muted-foreground">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Accordion type="single" collapsible className="space-y-4">
            {faqKeys.map((key, index) => (
              <AccordionItem
                key={key}
                value={`item-${index}`}
                className="group rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm
                           px-6 data-[state=open]:border-primary/30
                           transition-colors duration-200"
              >
                <AccordionTrigger className="text-left hover:no-underline py-5
                                              text-foreground font-medium">
                  {t(`items.${key}.question`)}
                </AccordionTrigger>
                <AccordionContent forceMount className="text-muted-foreground pb-5 leading-relaxed group-data-[state=closed]:hidden">
                  {t(`items.${key}.answer`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
