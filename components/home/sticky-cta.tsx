'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** Ids of sections during which the sticky CTA stays hidden (hero, pricing and finale have their own CTAs). */
const HIDE_WHILE_VISIBLE = ['hero', 'pricing', 'finale'];

/** Compact bar that appears after the hero and hides while pricing or the finale is on screen. */
export default function StickyCta() {
  const t = useTranslations('home.sticky');
  const [show, setShow] = useState(false);

  useEffect(() => {
    const targets = HIDE_WHILE_VISIBLE.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const onScreen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target.id);
        else onScreen.delete(entry.target.id);
      }
      setShow(onScreen.size === 0);
    });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="sticky-cta"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6"
        >
          <div className="flex items-center justify-between gap-4 rounded-pill border border-line-strong bg-surface-raised/95 py-1.5 pl-5 pr-1.5 shadow-constellation backdrop-blur-md">
            <p className="hidden text-step-xs text-ink-2 min-[400px]:block">{t('text')}</p>
            <Button asChild size="sm">
              <Link href={{ pathname: '/', hash: 'pricing' }}>{t('cta')}</Link>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
