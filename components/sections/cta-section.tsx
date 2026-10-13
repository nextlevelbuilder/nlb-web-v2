import { useTranslations } from 'next-intl';
import CheckoutWidget from '@/components/home/checkout-widget';
import SectionPlate from '@/components/home/section-plate';

/** Chapter VIII · Finale: the last checkout CTA with risk reversal. */
export default function CTASection() {
  const t = useTranslations('home.finale');
  return (
    <section id="finale" aria-labelledby="finale-title" className="section-pad sky-backdrop">
      <div className="wrap">
        <SectionPlate numeral="VIII" name={t('coord')} />
        <h2 id="finale-title" className="h-display max-w-[14ch]">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>
        <CheckoutWidget source="finale" className="mt-10" />
        <p className="mono-label mt-6 text-ink-3">{t('risk')}</p>
      </div>
    </section>
  );
}
