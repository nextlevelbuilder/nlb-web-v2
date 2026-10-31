import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { publishedPolicySlugs } from '@/lib/policies/published-policies';
import { POLICIES, getPolicy, policyHref, policySlugsByGroup, toPolicyLocale, type PolicyGroup } from '@/content/policies';
import { policyUiCopy } from '@/content/policies/policy-ui-copy';
import { pageMetadata } from '@/lib/seo';
import { PolicyArticle } from './policy-article';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const copy = policyUiCopy[toPolicyLocale(locale)];
  return pageMetadata({ title: copy.title, description: copy.subtitle, path: '/policies', locale });
}

export default async function PoliciesPage({ params }: Props) {
  const { locale } = await params;
  const policyLocale = toPolicyLocale(locale);
  const copy = policyUiCopy[policyLocale];
  const overview = getPolicy('overview', policyLocale);
  // The registry always contains the overview; this guard only narrows the type.
  if (!overview) throw new Error('Policy overview content is missing');

  const groups: { group: PolicyGroup; label: string }[] = [
    { group: 'community', label: copy.communityGroup },
    { group: 'legal', label: copy.legalGroup },
  ];

  return (
    <div className="space-y-16">
      <PolicyArticle
        doc={overview}
        copy={copy}
        eyebrow={copy.title}
        lastUpdated={overview.lastUpdated}
        showBackLink={false}
      />

      <section aria-labelledby="all-policies" className="space-y-10">
        <h2 id="all-policies" className="font-display text-step-2xl font-light">
          {copy.allPolicies}
        </h2>
        {groups.map(({ group, label }) => (
          <div key={group}>
            <h3 className="mono-label mb-4 text-ink-3">{label}</h3>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {policySlugsByGroup(group, publishedPolicySlugs())
                .filter((slug) => slug !== 'overview')
                .map((slug) => {
                  const doc = POLICIES[slug].content[policyLocale];
                  return (
                    <li key={slug}>
                      <Link
                        href={policyHref(slug)}
                        className="surface-panel group flex h-full flex-col gap-2 p-5 transition-colors duration-base hover:border-line-strong"
                      >
                        <span className="font-display text-step-lg font-medium text-foreground group-hover:text-primary">
                          {doc.title}
                        </span>
                        <span className="text-step-sm text-ink-2">{doc.summary}</span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
