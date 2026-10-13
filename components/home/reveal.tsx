'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Calm fade-up on first view. MotionConfig (reducedMotion="user") drops the transform for visitors who
 * prefer reduced motion, leaving a short opacity fade. Use only below the fold so the LCP stays text.
 */
export default function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
