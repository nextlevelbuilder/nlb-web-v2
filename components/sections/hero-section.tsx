'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Shield, Users, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

// Animation variants for staggered entrance
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const fadeInVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.8, ease: 'easeOut' },
  },
};

interface HeroSectionProps {
  onScrollToPricing: () => void;
}

export default function HeroSection({ onScrollToPricing }: HeroSectionProps) {
  const t = useTranslations('hero');

  return (
    <section className="relative min-h-[90vh] flex items-center pt-24 pb-20 px-6 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Radial gradient from top */}
        <div className="absolute inset-0 bg-gradient-radial-top from-primary/8 to-transparent" />

        {/* Subtle accent orbs */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, delay: 0.3, ease: 'easeOut' }}
          className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]"
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Content */}
      <div className="container mx-auto max-w-5xl relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="text-center"
        >
          {/* Urgency Badge */}
          <motion.div variants={itemVariants} className="mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                           bg-success/10 border border-success/20
                           text-sm font-medium text-foreground
                           shadow-inner-highlight">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              {t('urgencyBadge')}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={itemVariants}
            className="heading-display text-4xl sm:text-display-xl lg:text-display-2xl
                       text-foreground mb-6 text-balance"
          >
            {t('headline')}
            <br className="hidden sm:block" />
            <span className="text-gradient-primary">{t('headlineHighlight')}</span>
            <br className="hidden sm:block" />
            {t('headlineEnd')}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={itemVariants}
            className="text-body-lg text-muted-foreground mb-12
                       max-w-2xl mx-auto leading-relaxed"
          >
            {t('subheadline')}
          </motion.p>

          {/* CTA Group */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <Button
              onClick={onScrollToPricing}
              size="lg"
              className="btn-premium w-full sm:w-auto min-w-[220px] h-14 text-base
                         bg-primary hover:bg-primary/90
                         shadow-lg shadow-primary/25"
            >
              {t('ctaPrimary')}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              asChild
              className="w-full sm:w-auto min-w-[220px] h-14 text-base
                         border-border/60 hover:border-primary/50
                         hover:bg-primary/5 transition-all duration-250"
            >
              <Link href={process.env.NEXT_PUBLIC_DISCORD_URL || '#'}>
                {t('ctaSecondary')}
              </Link>
            </Button>
          </motion.div>

          {/* Trust Signals */}
          <motion.div
            variants={fadeInVariants}
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
          >
            <TrustSignal icon={Shield} text={t('trustMoneyBack')} />
            <TrustSignal icon={Users} text={t('trustMembers')} />
            <TrustSignal icon={Zap} text={t('trustPayment')} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function TrustSignal({ icon: Icon, text }: { icon: typeof Shield; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="flex items-center justify-center w-8 h-8 rounded-full
                      bg-success/10 border border-success/20">
        <Icon className="w-4 h-4 text-success" />
      </div>
      <span>{text}</span>
    </div>
  );
}
