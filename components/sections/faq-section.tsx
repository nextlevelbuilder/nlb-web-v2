import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import Reveal from '@/components/home/reveal';
import { HOME_FAQ_KEYS } from '@/lib/home/home-faq';

/**
 * Questions & answers before the finale. Native <details>/<summary> disclosures: keyboard operable,
 * announced as expandable, readable without JavaScript, and the chevron turn is skipped under reduced motion.
 * The same copy feeds the FAQPage JSON-LD on the homepage.
 */
export default function FaqSection() {
  const t = useTranslations('faq');

  return (
    <section id="faq" aria-labelledby="faq-title" className="pt-section-sm">
      <div className="wrap grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <Reveal>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="faq-title" className="h-section mt-6 max-w-[16ch] text-step-2xl">{t('title')}</h2>
          <p className="lede mt-4 text-step-base">{t('subtitle')}</p>
        </Reveal>
        <div className="border-t border-line">
          {HOME_FAQ_KEYS.map((key) => (
            <details key={key} className="group border-b border-line">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-start justify-between gap-6 py-5 text-step-base text-foreground transition-colors duration-base hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <span className="font-display">{t(`items.${key}.question`)}</span>
                <ChevronDown
                  className="mt-1 h-4 w-4 shrink-0 text-ink-3 transition-transform duration-base group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[68ch] pb-6 text-step-sm leading-relaxed text-ink-2">{t(`items.${key}.answer`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
