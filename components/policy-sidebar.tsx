'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { POLICY_SLUGS } from '@/lib/constants/policy-slugs';

export default function PolicySidebar() {
  const t = useTranslations('policies');
  const pathname = usePathname();
  const locale = useLocale();

  const getHref = (slug: string) => {
    const base = locale === 'vi' ? '/policies' : `/${locale}/policies`;
    return slug === 'overview' ? base : `${base}/${slug}`;
  };

  const isActive = (slug: string) => {
    if (slug === 'overview') {
      return pathname.endsWith('/policies');
    }
    return pathname.endsWith(`/policies/${slug}`);
  };

  return (
    <nav aria-label="Policy navigation">
      {/* Desktop sidebar */}
      <div className="hidden md:block w-56 flex-shrink-0">
        <div className="sticky top-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-3">
            {t('title')}
          </p>
          <ul className="space-y-1">
            {POLICY_SLUGS.map((slug) => {
              const active = isActive(slug);
              return (
                <li key={slug}>
                  <Link
                    href={getHref(slug)}
                    className={[
                      'block px-3 py-2 rounded-md text-sm transition-colors duration-200',
                      active
                        ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[10px]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    ].join(' ')}
                  >
                    {t(`nav.${slug}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Mobile horizontal tabs */}
      <div className="md:hidden w-full overflow-x-auto pb-2 border-b border-border/50 mb-6">
        <div className="flex gap-1 min-w-max px-1">
          {POLICY_SLUGS.map((slug) => {
            const active = isActive(slug);
            return (
              <Link
                key={slug}
                href={getHref(slug)}
                className={[
                  'px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors duration-200',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                ].join(' ')}
              >
                {t(`nav.${slug}`)}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
