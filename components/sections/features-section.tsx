'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  BookMarked,
  BookOpen,
  MessageCircle,
  Library,
  Rocket,
  Network
} from 'lucide-react';
import FeatureCard from '@/components/feature-card';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const headerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function FeaturesSection() {
  const t = useTranslations('features');

  const features = [
    { icon: BookMarked, titleKey: 'provenPlaybooks', descKey: 'provenPlaybooks' },
    { icon: BookOpen, titleKey: 'resources', descKey: 'resources' },
    { icon: MessageCircle, titleKey: 'communitySupport', descKey: 'communitySupport' },
    { icon: Library, titleKey: 'recordedLibrary', descKey: 'recordedLibrary' },
    { icon: Rocket, titleKey: 'realLaunches', descKey: 'realLaunches' },
    { icon: Network, titleKey: 'founderNetwork', descKey: 'founderNetwork' },
  ];

  return (
    <section id="features" className="py-section px-6 relative">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative">
        {/* Section Header */}
        <motion.div
          variants={headerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-medium text-primary mb-4 tracking-wide uppercase">
            What You Get
          </span>
          <h2 className="heading-section text-3xl sm:text-h1 lg:text-display-lg text-foreground mb-6">
            {t('title')}
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
        >
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.titleKey}
              icon={feature.icon}
              title={t(`${feature.titleKey}.title`)}
              description={t(`${feature.descKey}.description`)}
              index={index}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
