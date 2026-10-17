'use client';

import { useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import {
  POLICIES,
  policyHref,
  policySlugsByGroup,
  toPolicyLocale,
  type PolicyGroup,
  type PolicyPageSlug,
} from '@/content/policies';
import { policyUiCopy } from '@/content/policies/policy-ui-copy';

const GROUPS: PolicyGroup[] = ['community', 'legal'];

/**
 * Policy navigation: a sticky grouped list from `md` up, and a native
 * disclosure on small screens (no horizontal scrolling at 320 px).
 */
export default function PolicySidebar() {
  const locale = toPolicyLocale(useLocale());
  const copy = policyUiCopy[locale];
  // next-intl's usePathname returns the path without the locale prefix.
  const pathname = usePathname().replace(/\/+$/, '') || '/';

  const isActive = (slug: PolicyPageSlug) =>
    slug === 'overview' ? pathname === '/policies' || pathname === '/policies/overview' : pathname === policyHref(slug);

  const groupLabel = (group: PolicyGroup) => (group === 'community' ? copy.communityGroup : copy.legalGroup);

  const list = (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mono-label mb-3 text-ink-3">{groupLabel(group)}</p>
          <ul className="border-l border-line">
            {policySlugsByGroup(group).map((slug) => {
              const active = isActive(slug);
              return (
                <li key={slug}>
                  <Link
                    href={policyHref(slug)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      '-ml-px flex min-h-[44px] items-center border-l py-2 pl-4 pr-2 text-step-sm transition-colors duration-base',
                      active
                        ? 'border-primary font-medium text-foreground'
                        : 'border-transparent text-ink-2 hover:border-line-strong hover:text-foreground',
                    ].join(' ')}
                  >
                    {POLICIES[slug].content[locale].navLabel}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <nav aria-label={copy.navLabel} className="md:w-56 md:flex-none">
      <div className="hidden md:sticky md:top-[calc(var(--header-h)+2rem)] md:block">{list}</div>

      <details className="surface-panel group md:hidden">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-step-sm font-medium [&::-webkit-details-marker]:hidden">
          {copy.allPolicies}
          <span aria-hidden className="text-ink-3 transition-transform duration-base group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="border-t border-line px-4 py-5">{list}</div>
      </details>
    </nav>
  );
}
