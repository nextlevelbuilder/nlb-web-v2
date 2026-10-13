'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ExternalLink, Sparkles, Palette, Bot, GraduationCap, Shield, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EditorialDisclosure from '@/components/editorial-disclosure';

const products = [
  {
    id: 'claudekit',
    name: 'ClaudeKit',
    url: 'https://claudekit.cc',
    icon: Sparkles,
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
    bgGlow: 'bg-violet-500/20',
  },
  {
    id: 'uiuxpromax',
    name: 'UI UX Pro Max',
    url: 'https://uupm.cc',
    icon: Palette,
    gradient: 'from-cyan-500 via-blue-500 to-indigo-500',
    bgGlow: 'bg-cyan-500/20',
  },
  {
    id: 'agenticworking',
    name: 'Agentic Working',
    url: 'https://agenticworking.io',
    icon: Bot,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    bgGlow: 'bg-emerald-500/20',
  },
  {
    id: '200lab',
    name: '200lab',
    url: 'https://200lab.io',
    icon: GraduationCap,
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    bgGlow: 'bg-orange-500/20',
  },
  {
    id: 'goclaw',
    name: 'GoClaw',
    url: 'https://goclaw.sh',
    icon: Shield,
    gradient: 'from-rose-500 via-red-500 to-orange-500',
    bgGlow: 'bg-rose-500/20',
  },
  {
    id: 'tose',
    name: 'TOSE',
    url: 'https://tose.sh',
    icon: Rocket,
    gradient: 'from-sky-500 via-blue-500 to-violet-500',
    bgGlow: 'bg-sky-500/20',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function ProductsSection() {
  const t = useTranslations('products');

  return (
    <section id="products" className="py-24 px-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto max-w-6xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold mb-4">
            <span className="bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
              {t('title')}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Products grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <motion.div
                key={product.id}
                variants={cardVariants}
                className="group relative"
              >
                <div className="relative p-8 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 h-full">
                  {/* Glow effect on hover */}
                  <div className={`absolute inset-0 ${product.bgGlow} rounded-2xl blur-2xl opacity-0 group-hover:opacity-50 transition-opacity duration-500`} />

                  <div className="relative z-10">
                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${product.gradient} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>

                    {/* Content */}
                    <h3 className="text-2xl font-heading font-bold mb-3 group-hover:text-primary transition-colors duration-300">
                      {product.name}
                    </h3>
                    <p className="text-muted-foreground mb-6 leading-relaxed">
                      {t(`${product.id}.description`)}
                    </p>

                    {/* CTA */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="group/btn"
                      asChild
                    >
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('visitSite')}
                        <ExternalLink className="w-4 h-4 ml-2 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform duration-200" />
                      </a>
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Editorial Disclosure */}
        <EditorialDisclosure className="mt-12 max-w-4xl mx-auto" />
      </div>
    </section>
  );
}
