import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { POLICY_SLUGS, type PolicySlug } from '@/lib/constants/policy-slugs';
import { pageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!POLICY_SLUGS.includes(slug as PolicySlug)) {
    return { title: 'Not Found' };
  }

  const t = await getTranslations({ locale, namespace: 'policies' });
  const policy = t.raw(slug as PolicySlug) as { title: string };

  return pageMetadata({ title: policy.title, description: t('subtitle'), path: `/policies/${slug}`, locale });
}

export default async function PolicySlugPage({ params }: Props) {
  const { locale, slug } = await params;

  if (!POLICY_SLUGS.includes(slug as PolicySlug)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'policies' });
  const policy = t.raw(slug as PolicySlug) as {
    title: string;
    sections: { heading: string; content: string }[];
  };

  const base = locale === 'vi' ? '/policies' : `/${locale}/policies`;

  return (
    <div>
      {/* Back link */}
      <Link
        href={base}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
      >
        <span aria-hidden>←</span>
        {t('backToOverview')}
      </Link>

      {/* Policy title */}
      <h1 className="text-3xl font-bold text-foreground mb-10">{policy.title}</h1>

      {/* Sections */}
      <div className="space-y-8">
        {policy.sections.map((section, i) => (
          <section key={i}>
            <h2 className="text-lg font-semibold text-foreground mb-3 pb-2 border-b border-border/50">
              {section.heading}
            </h2>
            <ContentRenderer content={section.content} />
          </section>
        ))}
      </div>
    </div>
  );
}

// Renders section content: supports \n line breaks and • bullet points
function ContentRenderer({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1 text-sm text-muted-foreground leading-relaxed">
      {lines.map((line, i) => {
        if (line.trim() === '') {
          return <div key={i} className="h-2" />;
        }
        if (line.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-primary mt-0.5 flex-shrink-0">•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        return (
          <p key={i} className={line.match(/^\d+\./) ? 'pl-0' : ''}>
            {line}
          </p>
        );
      })}
    </div>
  );
}
