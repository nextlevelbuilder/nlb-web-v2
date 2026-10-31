import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LAUNCH_GATED_POLICY_SLUGS, POLICY_PAGE_SLUGS, getPolicy, toPolicyLocale, type PolicyPageSlug } from '@/content/policies';
import { isPolicyPublished } from '@/lib/policies/published-policies';
import { policyUiCopy } from '@/content/policies/policy-ui-copy';
import { pageMetadata } from '@/lib/seo';
import { PolicyArticle } from '../policy-article';

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  // Launch-gated policies render on demand so the runtime flag decides, not the build.
  return POLICY_PAGE_SLUGS.filter((slug) => !LAUNCH_GATED_POLICY_SLUGS.includes(slug)).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const policy = isPolicyPublished(slug as PolicyPageSlug) ? getPolicy(slug, locale) : null;
  if (!policy) return { title: 'Not Found', robots: { index: false } };
  return pageMetadata({ title: policy.title, description: policy.summary, path: `/policies/${slug}`, locale });
}

export default async function PolicySlugPage({ params }: Props) {
  const { locale, slug } = await params;
  const policy = isPolicyPublished(slug as PolicyPageSlug) ? getPolicy(slug, locale) : null;
  if (!policy) notFound();

  const copy = policyUiCopy[toPolicyLocale(locale)];
  return (
    <PolicyArticle
      doc={policy}
      copy={copy}
      eyebrow={policy.group === 'legal' ? copy.legalGroup : copy.communityGroup}
      lastUpdated={policy.lastUpdated}
      showBackLink={policy.slug !== 'overview'}
      showToc={policy.group === 'legal'}
    />
  );
}
