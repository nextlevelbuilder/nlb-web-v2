import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { pick, type Founder } from '@/lib/constants/home-content';

/** Founder card: portrait, role, short bio, three facts and outbound links. */
export default function TeamMemberCard({ founder }: { founder: Founder }) {
  const t = useTranslations('home.team');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <article className="flex h-full flex-col gap-5 rounded-sm border border-line bg-surface p-6">
      <div className="flex items-center gap-4">
        <Image
          src={founder.avatar}
          alt={t('avatarAlt', { name: founder.name })}
          width={96}
          height={96}
          sizes="96px"
          unoptimized
          className="h-20 w-20 shrink-0 rounded-full border border-line-strong object-cover"
        />
        <div>
          <h3 className="font-display text-step-xl leading-tight">{founder.name}</h3>
          <p className="mt-1 text-step-xs text-ink-3">{pick(founder.role, locale)}</p>
        </div>
      </div>
      <p className="text-step-sm text-ink-2">{pick(founder.bio, locale)}</p>
      <ul className="flex flex-1 flex-col gap-2 border-t border-line pt-4">
        {pick(founder.facts, locale).map((fact) => (
          <li key={fact} className="flex gap-2 text-step-sm text-foreground">
            <span className="text-primary" aria-hidden="true">✦</span>
            {fact}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {[{ label: founder.company.name, href: founder.company.url }, ...founder.links].map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center font-mono text-step-xs text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-foreground"
          >
            {link.label}
            <span className="sr-only">
              {' '}
              {link.label === founder.company.name ? `(${t('company', { name: founder.company.name })})` : `(${founder.name})`} {tShell('newTab')}
            </span>
          </a>
        ))}
      </p>
    </article>
  );
}
