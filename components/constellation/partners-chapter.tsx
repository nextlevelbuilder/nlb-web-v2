import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { PARTNERS, pick, type Partner } from '@/lib/constants/home-content';
import ChapterPlate from './chapter-plate';
import SplitText from './split-text';

/** "DIGITOP.AI" → DIGITOP<i>.AI</i>: the domain suffix takes the accent, as in the brand wordmarks. */
function Wordmark({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return <h3 className="ally-word">{name}</h3>;
  return <h3 className="ally-word">{name.slice(0, dot)}<i>{name.slice(dot)}</i></h3>;
}

/** Logo (decorative) plus the partner name as the card heading; wordmark-only partners use the display face. */
function PartnerMark({ partner }: { partner: Partner }) {
  if (!partner.logo) return <Wordmark name={partner.name} />;
  const img = <Image src={partner.logo.src} alt="" width={partner.logo.width} height={partner.logo.height} unoptimized />;
  return (
    <>
      {partner.logo.plate ? <span className="plate-logo">{img}</span> : img}
      <h3 className="ally-name">{partner.name}</h3>
    </>
  );
}

/** Sub-chapter V·iii · alliance: the partner companies the founders lead and build with. */
export default function PartnersChapter() {
  const t = useTranslations('home.partners');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <section className="chapter section sub-chapter" id="partners" aria-labelledby="partners-title" data-ch="5">
      <div className="wrap">
        <ChapterPlate numeral="V·iii" name={t('plate')} coord="Pleiades · RA 03h 47m · Dec +24° 07′" />
        <div className="sec-head">
          <div className="sh-main">
            <SplitText id="partners-title" className="h2" text={t.raw('heading') as string} />
            <p className="lede">{t('subtitle')}</p>
          </div>
        </div>
        <ul className="alliance">
          {PARTNERS.map((partner) => (
            <li className="ally" key={partner.id}>
              <div className="ally-mark">
                <PartnerMark partner={partner} />
              </div>
              <p>{pick(partner.oneLiner, locale)}</p>
              <a className="visit mono" href={partner.url} target="_blank" rel="noopener noreferrer">
                {t('visit', { name: partner.name })} <span aria-hidden="true">↗</span>
                <span className="sr-only"> {tShell('newTab')}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
