import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { HOME_FAQ_KEYS } from '@/lib/home/home-faq';
import type { HomeBlogPost } from '@/lib/home/home-page-data';
import ChapterPlate from './chapter-plate';
import SplitText from './split-text';

const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο'] as const;

/**
 * Sub-chapter VII·ii · queries: the FAQ as a star catalogue of native <details> disclosures (readable
 * without JavaScript; the same copy feeds the FAQPage JSON-LD), then the latest blog posts when any exist.
 */
export default function FaqChapter({ posts }: { posts: HomeBlogPost[] }) {
  const t = useTranslations('faq');
  const tHome = useTranslations('home');
  const format = useFormatter();

  return (
    <section className="chapter section sub-chapter" id="faq" aria-labelledby="faq-title" data-ch="7">
      <div className="wrap">
        <ChapterPlate numeral="VII·ii" name={tHome('faq.plate')} coord="Andromeda · RA 00h 42m · Dec +41° 16′" />
        <div className="faq-grid">
          <div className="faq-head">
            <SplitText id="faq-title" className="h2" text={tHome.raw('faq.title') as string} />
            <p className="lede">{t('subtitle')}</p>
          </div>
          <div className="faq-list">
            {HOME_FAQ_KEYS.map((key, i) => (
              <details className="faq-item" key={key}>
                <summary>
                  <span className="greek" aria-hidden="true">{GREEK[i % GREEK.length]}</span>
                  <span className="q">{t(`items.${key}.question`)}</span>
                  <span className="pm" aria-hidden="true" />
                </summary>
                <p className="a">{t(`items.${key}.answer`)}</p>
              </details>
            ))}
          </div>
        </div>

        {posts.length > 0 && (
          <div className="catalogue logbook">
            <h3 className="catalogue-head mono">
              <span>{tHome('logbook.title')}</span>
              <span className="rule" aria-hidden="true" />
              <Link className="link-arrow" href="/blog">{tHome('logbook.all')} <span aria-hidden="true">→</span></Link>
            </h3>
            <ol className="log-entries">
              {posts.map((post) => {
                const date = post.publishedAt ? new Date(post.publishedAt) : null;
                const valid = date !== null && !Number.isNaN(date.getTime());
                return (
                  <li className="log-entry" key={post.slug}>
                    {valid && <time className="mono" dateTime={date.toISOString()}>{format.dateTime(date, { dateStyle: 'medium' })}</time>}
                    <strong><Link className="lb-link" href={`/blog/${post.slug}`}>{post.title}</Link></strong>
                    {post.description && <p>{post.description}</p>}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
