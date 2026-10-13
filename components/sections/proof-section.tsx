import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import Reveal from '@/components/home/reveal';
import SectionPlate from '@/components/home/section-plate';
import { FLAGSHIP_PRODUCTS, PROOF_STATS, pick } from '@/lib/constants/home-content';

/** Chapter V · Proof: measured figures and the flagship products the founders ship. */
export default function ProofSection() {
  const t = useTranslations('home.proof');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <section aria-labelledby="proof-title" className="section-pad pb-0">
      <div className="wrap">
        <SectionPlate numeral="V" name={t('plate')} />
        <Reveal>
          <h2 id="proof-title" className="h-section">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>
        </Reveal>
        <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {PROOF_STATS.map((stat) => (
            <div key={stat.key} className="flex flex-col-reverse gap-2 border-t border-line-strong pt-4">
              <dt className="text-step-sm text-ink-2">{t(stat.key)}</dt>
              <dd className="num-tab font-display text-step-3xl leading-none">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mono-label mt-20 text-ink-3">{t('productsTitle')}</h3>
        <ul className="mt-6 grid gap-6 md:grid-cols-3">
          {FLAGSHIP_PRODUCTS.map((product) => (
            <li key={product.id} className="surface-panel flex flex-col gap-4 p-6">
              <div className="flex items-center gap-3">
                {product.logo ? (
                  <Image src={product.logo} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-sm object-contain" />
                ) : (
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-sm border border-line-strong font-display text-step-lg italic text-primary">
                    {product.name.charAt(0)}
                  </span>
                )}
                <div>
                  <h4 className="font-display text-step-xl leading-tight">{product.name}</h4>
                  {product.formerly && <p className="mono-label text-ink-3">{t('formerly', { name: product.formerly })}</p>}
                </div>
              </div>
              <p className="text-step-base text-foreground">{pick(product.tagline, locale)}</p>
              <p className="flex-1 text-step-sm text-ink-2">{pick(product.description, locale)}</p>
              <a href={product.url} target="_blank" rel="noopener noreferrer" className="link-arrow self-start">
                {t('visit', { name: product.name })} <span aria-hidden="true">↗</span>
                <span className="sr-only">{tShell('newTab')}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
