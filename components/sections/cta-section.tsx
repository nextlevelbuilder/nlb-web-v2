'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Shield, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface CTASectionProps {
  onScrollToPricing: () => void;
}

export default function CTASection({ onScrollToPricing }: CTASectionProps) {
  const t = useTranslations('finalCTA');

  return (
    <section className="py-section px-6 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />

      {/* Decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-cyan-500/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="heading-display text-3xl sm:text-h1 lg:text-display-lg text-foreground mb-6">
            {t('title')}
          </h2>
          <p className="text-body-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            {t('subtitle')}
          </p>

          <Button
            onClick={onScrollToPricing}
            size="lg"
            className="btn-premium min-w-[250px] h-14 text-lg font-semibold
                       bg-primary hover:bg-primary/90
                       shadow-lg shadow-primary/25"
          >
            {t('button')}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-success" />
              </div>
              <span>{t('trustRiskFree')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-success" />
              </div>
              <span>{t('trustInstant')}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
