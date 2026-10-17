import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { FLAGSHIP_PRODUCTS, PROOF_STATS, pick } from '@/lib/constants/home-content';
import ChapterPlate from './chapter-plate';
import SplitText from './split-text';

const CATALOGUE = ['HD 41', 'HD 87', 'HD 112'] as const;

/** Splits "$100K+" into the count-up parts: prefix "$", number 100, suffix "K+". */
function countParts(value: string) {
  const match = /^([^\d]*)(\d+)(.*)$/.exec(value);
  return match ? { prefix: match[1], count: match[2], suffix: match[3] } : null;
}

/**
 * Chapter V · brightest: the team's real numbers (counting up on scroll) and, in place of the
 * mockup's sample testimonials, the founders' flagship products in the same quote-figure layout.
 */
export default function ProofChapter() {
  const t = useTranslations('home.proof');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <section className="chapter section proof" id="proof" aria-labelledby="proof-title" data-ch="5">
      <div className="wrap">
        <ChapterPlate numeral="V" name={t('plate')} coord="Sirius · RA 06h 45m · Dec −16° 43′" />
        <SplitText id="proof-title" className="h2" text={t.raw('title') as string} />
        <dl className="stats">
          {PROOF_STATS.map((stat) => {
            const parts = countParts(stat.value);
            return (
              <div className="stat" key={stat.key}>
                <dt className="sr-only">{t(stat.key)}</dt>
                <dd className="n num-tab" data-count={parts?.count} data-prefix={parts?.prefix || undefined} data-suffix={parts?.suffix || undefined}>{stat.value}</dd>
                <dd className="l" aria-hidden="true">{t(stat.key)}</dd>
              </div>
            );
          })}
        </dl>
        <p className="quotes-kicker mono">{t('productsTitle')}</p>
        <div className="quotes">
          {FLAGSHIP_PRODUCTS.map((product, i) => (
            <figure className="quote" key={product.id}>
              <div className="q-head">
                {product.logo ? (
                  <Image className="q-logo" src={product.logo} alt="" width={36} height={36} unoptimized />
                ) : (
                  <span className="q-mark" aria-hidden="true">{product.name.charAt(0)}</span>
                )}
                <div>
                  <h3>{product.name}</h3>
                  {product.formerly && <p className="q-was mono">{t('formerly', { name: product.formerly })}</p>}
                </div>
              </div>
              <blockquote>{pick(product.tagline, locale)}</blockquote>
              <p className="q-desc">{pick(product.description, locale)}</p>
              <figcaption>
                <span className="q-star" aria-hidden="true" />
                <a className="link-arrow" href={product.url} target="_blank" rel="noopener noreferrer">
                  {t('visit', { name: product.name })} <span aria-hidden="true">↗</span>
                  <span className="sr-only"> {tShell('newTab')}</span>
                </a>
                <span className="cat mono" aria-hidden="true">{CATALOGUE[i % CATALOGUE.length]}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
