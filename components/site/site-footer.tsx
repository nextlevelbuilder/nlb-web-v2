import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { API_DOCS_PATH } from '@/lib/constants/home-content';
import { SOCIAL_LABELS, SOCIAL_LINKS, type SocialNetwork } from '@/lib/constants/socials';
import BrandMark from './brand-mark';

const PAGES = [
  { key: 'nav.courses', href: '/courses' },
  { key: 'nav.buildWithUs', href: '/build-with-us' },
  { key: 'nav.leaderboard', href: '/leaderboards' },
  { key: 'nav.blog', href: '/blog' },
] as const;

const LEGAL = [
  { key: 'policies.terms', href: '/policies/terms' },
  { key: 'policies.privacy', href: '/policies/privacy' },
] as const;

const SOCIAL_ORDER: SocialNetwork[] = ['discord', 'github', 'x', 'linkedin'];

/** Site footer on every page (Constellation design): brand and tagline, one grid of links, origin line. */
export default function SiteFooter() {
  const t = useTranslations('shell');
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Link className="brand" href="/" aria-label={t('footer.topAria')}>
              <BrandMark orbit={false} />
              <span className="brand-name" style={{ display: 'inline' }}>Next Level <em>Builders</em></span>
            </Link>
            <p className="foot-tag">{t('footer.tagline')}</p>
          </div>
          <nav className="foot-links" aria-label={t('footer.navLabel')}>
            {PAGES.map(({ key, href }) => <Link key={key} href={href}>{t(key)}</Link>)}
            {/* API docs live outside the localized tree. */}
            <a href={API_DOCS_PATH}>{t('footer.apiDocs')}</a>
            <Link href="/mcp-server">{t('footer.mcpServer')}</Link>
            {LEGAL.map(({ key, href }) => <Link key={key} href={href}>{t(key)}</Link>)}
            {SOCIAL_ORDER.map((network) => (
              <a key={network} href={SOCIAL_LINKS[network]} target="_blank" rel="noopener noreferrer">
                {SOCIAL_LABELS[network]}<span className="sr-only"> {t('footer.newTab')}</span>
              </a>
            ))}
          </nav>
        </div>
        <div className="foot-bottom mono">
          <span>{t('footer.copyright', { year })}</span>
          <span>RA 00h 00m · Dec +00° 00′ — {t('footer.origin')}</span>
        </div>
      </div>
    </footer>
  );
}
