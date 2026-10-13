'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  index?: number;
}

export default function FeatureCard({
  icon: Icon,
  title,
  description,
  index = 0,
}: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -6, transition: { duration: 0.25, ease: [0.34, 1.56, 0.64, 1] } }}
      className="group relative"
    >
      {/* Card container */}
      <div className="relative h-full p-6 rounded-2xl
                      bg-card/60 backdrop-blur-sm
                      border border-border/50
                      shadow-premium-sm
                      transition-all duration-350 ease-premium
                      group-hover:border-primary/30
                      group-hover:shadow-premium
                      group-hover:bg-card/80">

        {/* Subtle inner highlight */}
        <div className="absolute inset-0 rounded-2xl
                        bg-gradient-to-b from-white/[0.02] to-transparent
                        pointer-events-none" />

        {/* Icon container with gradient */}
        <motion.div
          whileHover={{ rotate: 3, scale: 1.05 }}
          transition={{ duration: 0.2 }}
          className="relative w-14 h-14 mb-5 rounded-xl
                     bg-gradient-to-br from-primary/20 to-primary/5
                     border border-primary/20
                     flex items-center justify-center
                     shadow-inner-highlight
                     group-hover:from-primary/30 group-hover:to-primary/10
                     transition-all duration-300"
        >
          <Icon className="w-6 h-6 text-primary" />
        </motion.div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </motion.div>
  );
}
