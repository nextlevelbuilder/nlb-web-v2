import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { FOUNDERS, pick } from '@/lib/constants/home-content';
import ChapterPlate from './chapter-plate';
import SplitText from './split-text';

const COORDS = ['RA 06h 45m · Dec −16° 43′', 'RA 05h 14m · Dec −08° 12′', 'RA 14h 39m · Dec −60° 50′'] as const;

/** Each portrait sits at the centre of its own small orbit, like the course lenses. */
function FounderOrbit({ index }: { index: number }) {
  const tilt = [-8, 6, -14][index % 3];
  const dur = [24, 30, 20][index % 3];
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g transform="translate(160 92)">
        <ellipse className="orbit" rx="118" ry="38" transform={`rotate(${tilt})`} />
        <ellipse className="orbit dash" rx="150" ry="54" transform={`rotate(${tilt / 2})`} />
        <circle className="planet" r="3">
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" path="M-118 0a118 38 0 1 0 236 0a118 38 0 1 0-236 0" rotate="0" />
        </circle>
      </g>
    </svg>
  );
}

/** Sub-chapter V·ii · navigators: the three founders, in the Constellation card language. */
export default function FoundersChapter() {
  const t = useTranslations('home.team');
  const tPlate = useTranslations('home.founders');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <section className="chapter section sub-chapter" id="founders" aria-labelledby="founders-title" data-ch="5">
      <div className="wrap">
        <ChapterPlate numeral="V·ii" name={tPlate('plate')} coord="Orion’s belt · RA 05h 36m · Dec −01° 12′" />
        <div className="sec-head">
          <div className="sh-main">
            <SplitText id="founders-title" className="h2" text={t.raw('title') as string} />
            <p className="lede">{t('subtitle')}</p>
          </div>
        </div>
        <div className="founders-grid">
          {FOUNDERS.map((founder, i) => (
            <article className="surface founder" key={founder.id}>
              <div className="founder-plate">
                <FounderOrbit index={i} />
                <div className="lens-meta mono" aria-hidden="true"><span>{COORDS[i % COORDS.length]}</span></div>
                <Image src={founder.avatar} alt={t('avatarAlt', { name: founder.name })} width={104} height={104} sizes="104px" unoptimized />
              </div>
              <div className="founder-body">
                <h3>
                  {founder.name}
                  {founder.pronunciation && (
                    <span className="founder-phonetic">
                      <span className="sr-only">{t('pronounced')} </span>
                      {founder.pronunciation}
                    </span>
                  )}
                </h3>
                <p className="founder-role mono">{pick(founder.role, locale)}</p>
                <p className="founder-bio">{pick(founder.bio, locale)}</p>
                <ul className="feats">
                  {pick(founder.facts, locale).map((fact) => <li key={fact}>{fact}</li>)}
                </ul>
                <ul className="founder-links mono">
                  {founder.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label}
                        {link.handle && <span className="founder-handle">{link.handle}</span>}
                        <span className="sr-only">
                          {' '}
                          {link.href === founder.company.url ? `(${t('company', { name: founder.company.name })})` : `(${founder.name})`} {tShell('newTab')}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
