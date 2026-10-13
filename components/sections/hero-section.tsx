import { useTranslations } from 'next-intl';
import { ShieldCheck, Lock, Users } from 'lucide-react';
import CheckoutWidget from '@/components/home/checkout-widget';
import StarField from '@/components/home/star-field';
import { Link } from '@/i18n/navigation';

/** Chapter 0 · Hook. The h1 is the LCP element; the starfield is decorative and paints after it. */
export default function HeroSection() {
  const t = useTranslations('home');
  const trust = [
    { icon: ShieldCheck, label: t('trust.moneyBack') },
    { icon: Lock, label: t('trust.polar') },
    { icon: Users, label: t('trust.builders') },
  ];

  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate flex min-h-[100svh] items-center overflow-hidden pt-header">
      <StarField className="-z-10" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-b from-transparent to-background" />
      <div className="wrap py-16 sm:py-24">
        <p className="eyebrow">{t('hook.eyebrow')}</p>
        <h1 id="hero-title" className="h-display mt-6 max-w-[15ch]">
          {t.rich('hook.title', { em: (chunks) => <em>{chunks}</em> })}
        </h1>
        <p className="lede mt-6">{t('hook.sub')}</p>

        <CheckoutWidget source="hero" className="mt-10" />

        <Link href="/courses" className="link-arrow mt-4">
          {t('hook.ctaSecondary')} <span aria-hidden="true">→</span>
        </Link>

        <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6">
          {trust.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-step-sm text-ink-2">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
