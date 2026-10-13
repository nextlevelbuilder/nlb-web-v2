import { useTranslations } from 'next-intl';
import Logo from '@/components/logo';
import { Link } from '@/i18n/navigation';
import { SOCIAL_LABELS, SOCIAL_LINKS, type SocialNetwork } from '@/lib/constants/socials';
import { API_DOCS_PATH } from '@/lib/constants/home-content';

const EXPLORE = [
  { key: 'courses', href: '/courses' },
  { key: 'directory', href: '/build-with-us' },
  { key: 'leaderboard', href: '/leaderboards' },
  { key: 'blog', href: '/blog' },
  { key: 'buildWithUs', href: '/build-with-us/instructions' },
] as const;

const POLICIES = [
  { key: 'overview', href: '/policies' },
  { key: 'shipPolicy', href: '/policies/ship-policy' },
  { key: 'contributorPolicy', href: '/policies/contributor-policy' },
  { key: 'membershipTiers', href: '/policies/membership-tiers' },
  { key: 'onboarding', href: '/policies/onboarding' },
  { key: 'violations', href: '/policies/violations' },
  { key: 'terms', href: '/policies/terms' },
  { key: 'privacy', href: '/policies/privacy' },
  { key: 'refund', href: '/policies/refund' },
  { key: 'cookies', href: '/policies/cookies' },
] as const;

const SOCIAL_ORDER: SocialNetwork[] = ['discord', 'x', 'linkedin', 'github'];

const LINK = 'inline-flex min-h-[32px] items-center text-step-sm text-ink-2 transition-colors duration-base hover:text-foreground';

function Column({ title, children, listClassName = 'flex flex-col gap-1' }: { title: string; children: React.ReactNode; listClassName?: string }) {
  return (
    <div>
      <h2 className="mono-label mb-4 text-ink-3">{title}</h2>
      <ul className={listClassName}>{children}</ul>
    </div>
  );
}

/** Site footer rendered by every page: explore links, community socials, and every policy page. */
export default function FooterSection() {
  const t = useTranslations('shell');
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-canvas-deep/40">
      <div className="wrap grid gap-12 py-16 lg:grid-cols-[1fr_2.8fr]">
        <div className="flex flex-col gap-4">
          <Logo size="md" />
          <p className="max-w-[32ch] text-step-sm text-ink-2">{t('footer.tagline')}</p>
        </div>

        <nav aria-label={t('footer.navLabel')} className="grid gap-10 sm:grid-cols-[1fr_1fr_1.6fr]">
          <Column title={t('footer.explore')}>
            {EXPLORE.map(({ key, href }) => (
              <li key={key}>
                <Link href={href} className={LINK}>
                  {t(`nav.${key}`)}
                </Link>
              </li>
            ))}
            <li>
              {/* API docs live outside the localized tree. */}
              <a href={API_DOCS_PATH} className={LINK}>
                {t('footer.apiDocs')}
              </a>
            </li>
          </Column>

          <Column title={t('footer.community')}>
            {SOCIAL_ORDER.map((network) => (
              <li key={network}>
                <a href={SOCIAL_LINKS[network]} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {SOCIAL_LABELS[network]}
                  <span className="sr-only"> {t('footer.newTab')}</span>
                </a>
              </li>
            ))}
          </Column>

          <Column title={t('footer.policies')} listClassName="grid gap-x-6 gap-y-1 min-[400px]:grid-cols-2 sm:grid-cols-1 xl:grid-cols-2">
            {POLICIES.map(({ key, href }) => (
              <li key={key}>
                <Link href={href} className={LINK}>
                  {t(`policies.${key}`)}
                </Link>
              </li>
            ))}
          </Column>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-wrap items-center justify-between gap-4 py-6">
          <p className="mono-label text-ink-3">{t('footer.copyright', { year })}</p>
          <a href="#main-content" className="mono-label inline-flex min-h-[44px] items-center text-ink-3 hover:text-foreground">
            {t('footer.backToTop')} ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
