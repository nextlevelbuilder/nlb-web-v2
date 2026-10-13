import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { PARTNERS, pick } from '@/lib/constants/home-content';
import { cn } from '@/lib/utils';

/** Typographic wordmark for partners without a logo file: "DIGITOP.AI" renders the suffix in the accent. */
function Wordmark({ name }: { name: string }) {
  const dot = name.indexOf('.');
  return (
    <span className="font-display text-step-xl font-semibold tracking-[0.04em]">
      {dot > 0 ? name.slice(0, dot) : name}
      {dot > 0 && <span className="text-primary">{name.slice(dot)}</span>}
    </span>
  );
}

/** Partner companies the founders lead. DIGITOP.AI uses a typographic wordmark. */
export default function PartnersSection() {
  const t = useTranslations('home.partners');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <section aria-labelledby="partners-title" className="pt-section-sm">
      <div className="wrap">
        <h2 id="partners-title" className="font-display text-step-2xl">{t('title')}</h2>
        <p className="mt-2 text-step-sm text-ink-2">{t('subtitle')}</p>
        <ul className="mt-8 grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
          {PARTNERS.map((partner) => (
            <li key={partner.id} className="bg-background">
              <a
                href={partner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col gap-4 p-6 transition-colors duration-base hover:bg-surface"
              >
                <span className="flex h-11 items-center">
                  {partner.logo ? (
                    <span className={cn('inline-flex items-center gap-2', partner.logo.plate && 'rounded-sm bg-[#f6f1e6] px-3 py-1.5')}>
                      <Image src={partner.logo.src} alt="" width={partner.logo.width} height={partner.logo.height} unoptimized className="h-8 w-auto" />
                      {!partner.logo.plate && <span className="font-mono text-step-sm tracking-[0.08em]">{partner.name}</span>}
                    </span>
                  ) : (
                    <Wordmark name={partner.name} />
                  )}
                </span>
                <span className="text-step-sm text-ink-2">{pick(partner.oneLiner, locale)}</span>
                <span className="mono-label mt-auto text-ink-3 group-hover:text-foreground">
                  {t('visit', { name: partner.name })} ↗<span className="sr-only"> {tShell('newTab')}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
