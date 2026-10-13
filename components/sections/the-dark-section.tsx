import { useTranslations } from 'next-intl';
import Reveal from '@/components/home/reveal';
import SectionPlate from '@/components/home/section-plate';

/** Chapter I · The dark. Empathy beat: building alone. */
export default function TheDarkSection() {
  const t = useTranslations('home.dark');
  return (
    <section aria-labelledby="dark-title" className="section-pad">
      <div className="wrap">
        <SectionPlate numeral="I" name={t('plate')} />
        <Reveal>
          <h2 id="dark-title" className="h-section max-w-[22ch]">
            {t.rich('title', { em: (chunks) => <em>{chunks}</em> })}
          </h2>
        </Reveal>
        <figure className="mt-16">
          <div
            aria-hidden="true"
            className="h-40 rounded-sm border border-line bg-canvas-deep sm:h-56"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 40% 60% at 30% 50%, hsl(var(--background)) 0%, transparent 70%), radial-gradient(circle at 75% 35%, rgb(var(--star-rgb) / 0.35) 0 1px, transparent 2px), radial-gradient(circle at 62% 70%, rgb(var(--star-rgb) / 0.25) 0 1px, transparent 2px), radial-gradient(circle at 88% 60%, rgb(var(--star-rgb) / 0.3) 0 1px, transparent 2px)',
            }}
          />
          <figcaption className="mono-label mt-3 text-ink-3">{t('caption')}</figcaption>
        </figure>
      </div>
    </section>
  );
}
