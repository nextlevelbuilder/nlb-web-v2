import { useTranslations } from 'next-intl';
import Reveal from '@/components/home/reveal';
import SectionPlate from '@/components/home/section-plate';
import { DISCORD_INVITE_URL } from '@/lib/constants/socials';

const POINTS: [number, number][] = [[12, 70], [30, 38], [52, 54], [70, 22], [88, 44]];

/** Chapter II · Community (pillar 1): the private Discord. */
export default function CommunitySection() {
  const t = useTranslations('home.community');
  const tShell = useTranslations('shell.footer');
  const features = (['1', '2', '3'] as const).map((n) => ({ title: t(`f${n}t`), body: t(`f${n}d`) }));

  return (
    <section aria-labelledby="community-title" className="section-pad">
      <div className="wrap grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionPlate numeral="II" name={t('plate')} />
          <Reveal>
            <h2 id="community-title" className="h-section">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>
            <p className="lede mt-6">{t('body')}</p>
          </Reveal>
          <ul className="mt-10 grid gap-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {features.map((feature) => (
              <li key={feature.title} className="border-t border-line-strong pt-4">
                <h3 className="font-display text-step-xl">{feature.title}</h3>
                <p className="mt-2 text-step-sm text-ink-2">{feature.body}</p>
              </li>
            ))}
          </ul>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="link-arrow mt-8">
            Discord <span aria-hidden="true">↗</span>
            <span className="sr-only">{tShell('newTab')}</span>
          </a>
        </div>
        <figure className="surface-panel p-6">
          <svg viewBox="0 0 100 90" className="h-auto w-full text-ink-2" aria-hidden="true" focusable="false">
            <polyline points={POINTS.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.3" />
            {POINTS.map(([x, y], i) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={i === 3 ? 1.6 : 1} className={i === 3 ? 'fill-primary' : 'fill-current'} />
            ))}
          </svg>
          <figcaption className="mono-label mt-4 text-ink-3">{t('label')}</figcaption>
        </figure>
      </div>
    </section>
  );
}
