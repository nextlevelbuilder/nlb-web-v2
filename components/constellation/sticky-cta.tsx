'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/** Sections that carry their own CTA; the bar hides while any of them is on screen. */
const HIDE_WHILE_VISIBLE = ['hook', 'pricing', 'finale'] as const;

/** Sticky smart CTA: appears after the hook, hides at pricing and the finale. Untabbable while hidden. */
export default function StickyCta() {
  const t = useTranslations('home');
  const [show, setShow] = useState(false);

  useEffect(() => {
    const targets = HIDE_WHILE_VISIBLE.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const visible = new Set<string>(['hook']);
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      setShow(visible.size === 0);
    }, { threshold: 0 });
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={show ? 'sticky-cta show' : 'sticky-cta'} id="sticky-cta" aria-hidden={!show}>
      <p>{t('sticky.text')}</p>
      <a className="btn btn-primary btn-sm" href="#pricing" tabIndex={show ? 0 : -1}>{t('cta.primary')}</a>
    </div>
  );
}
