import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { POLICY_PAGE_SLUGS, getPolicy, toPolicyLocale } from '@/content/policies';
import { policyUiCopy } from '@/content/policies/policy-ui-copy';
import { pageMetadata } from '@/lib/seo';
import { PolicyArticle } from '../policy-article';

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return POLICY_PAGE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const policy = getPolicy(slug, locale);
  if (!policy) return { title: 'Not Found', robots: { index: false } };
  return pageMetadata({ title: policy.title, description: policy.summary, path: `/policies/${slug}`, locale });
}

export default async function PolicySlugPage({ params }: Props) {
  const { locale, slug } = await params;
  const policy = getPolicy(slug, locale);
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
