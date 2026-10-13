import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import Link from 'next/link';
import { POLICY_SLUGS } from '@/lib/constants/policy-slugs';
import { pageMetadata } from '@/lib/seo';

// Policy index shows cards for all slugs except 'overview' (shown inline)
const CARD_SLUGS = POLICY_SLUGS.filter((s) => s !== 'overview');

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'policies' });
  return pageMetadata({ title: t('title'), description: t('subtitle'), path: '/policies', locale });
}

export default async function PoliciesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'policies' });

  // Overview sections
  const overview = t.raw('overview') as {
    title: string;
    sections: { heading: string; content: string }[];
  };

  const base = locale === 'vi' ? '/policies' : `/${locale}/policies`;

  return (
    <div>
      {/* Page header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Overview content */}
      <div className="mb-12 space-y-6">
        <h2 className="text-xl font-semibold text-foreground">{overview.title}</h2>
        {overview.sections.map((section, i) => (
          <div key={i}>
            <h3 className="text-base font-semibold text-foreground mb-2">{section.heading}</h3>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {section.content}
            </div>
          </div>
        ))}
      </div>

      {/* Cards linking to each policy */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">{t('title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CARD_SLUGS.map((slug) => {
            const policy = t.raw(slug) as { title: string; sections: { heading: string }[] };
            return (
              <Link
                key={slug}
                href={`${base}/${slug}`}
                className="block rounded-lg border border-border/50 bg-card/40 p-5 hover:bg-card/70 hover:border-border transition-colors duration-200 group"
              >
                <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-200 mb-1">
                  {policy.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {policy.sections[0]?.heading}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
