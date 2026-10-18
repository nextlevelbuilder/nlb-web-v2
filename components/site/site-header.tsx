'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { signOut, useSession } from '@/lib/auth-client';
import { lockScroll } from '@/lib/constellation/smooth-scroll';
import BrandMark from './brand-mark';
import LangSeg from './lang-seg';
import SoundToggle from './sound-toggle';
import ThemeSeg from './theme-seg';
import { isCurrentNavItem, navItemsFor, type NavItem } from './site-nav-items';
import { useBuilderLeagueNav } from './use-builder-league-nav';

const DESKTOP = '(min-width: 1140px)';

/** Home sections render plain anchors on the home page (scrolled by the home engine); everything else is a locale-aware route. */
function NavLink({ item, onHome, pathname, onNavigate, children, className }: {
  item: NavItem;
  onHome: boolean;
  pathname: string;
  onNavigate?: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (onHome && item.homeAnchor) {
    return <a href={item.homeAnchor} className={className} onClick={onNavigate}>{children}</a>;
  }
  const current = isCurrentNavItem(pathname, item);
  return (
    <Link href={item.route} className={className} aria-current={current ? 'page' : undefined} onClick={onNavigate}>
      {children}
    </Link>
  );
}

/**
 * Site header on every page (Constellation design): brand, primary nav, language, theme + sound controls,
 * sign-in or the signed-in builder, the Join CTA and the full-screen mobile menu. Owns the skip link.
 */
export default function SiteHeader() {
  const t = useTranslations('shell');
  const tHome = useTranslations('home.cta');
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const onHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  // The menu belongs to the route it was opened on, so any navigation closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = useCallback((next: boolean) => setOpenOn(next ? pathname : null), [pathname]);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = useCallback((focusButton: boolean) => {
    setOpen(false);
    if (focusButton) menuBtn.current?.focus();
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    menu.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(true); };
    const desktop = window.matchMedia(DESKTOP);
    const onDesktop = () => { if (desktop.matches) closeMenu(false); };
    document.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onDesktop);
    return () => {
      document.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onDesktop);
      lockScroll(false);
    };
  }, [open, closeMenu]);

  const onMenuClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('a')) closeMenu(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setOpen(false);
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const user = session?.user;
  const nav = navItemsFor(useBuilderLeagueNav(user));
  const who = user ? user.name || user.email || '' : '';
  const joinHref = onHome ? '#pricing' : undefined;

  const join = (className: string, label: string, aria?: string) => joinHref
    ? <a className={className} href={joinHref} aria-label={aria}>{label}</a>
    : <Link className={className} href={{ pathname: '/', hash: 'pricing' }} aria-label={aria}>{label}</Link>;

  return (
    <>
      <a className="skip" href="#main">{t('skip')}</a>
      <header className={`site-header${scrolled ? ' scrolled' : ''}`} id="site-header">
        <div className="bar">
          {onHome ? (
            <a className="brand" href="#hook" aria-label={t('home')}>
              <BrandMark />
              <span className="brand-name">Next Level <em>Builders</em></span>
              <span className="brand-short" aria-hidden="true">NLB</span>
            </a>
          ) : (
            <Link className="brand" href="/" aria-label={t('home')}>
              <BrandMark />
              <span className="brand-name">Next Level <em>Builders</em></span>
              <span className="brand-short" aria-hidden="true">NLB</span>
            </Link>
          )}
          <nav className="nav" aria-label={t('navPrimary')}>
            {nav.map((item) =>
              item.key === 'builderLeague' ? (
                // Short label, shown only where the desktop bar has room for a seventh item.
                <NavLink key={item.key} item={item} onHome={onHome} pathname={pathname} className="nav-wide-only">
                  <span aria-hidden>{t('nav.builderLeagueShort')}</span>
                  <span className="sr-only">{t('nav.builderLeague')}</span>
                </NavLink>
              ) : (
                <NavLink key={item.key} item={item} onHome={onHome} pathname={pathname}>{t(`nav.${item.key}`)}</NavLink>
              )
            )}
          </nav>
          <div className="bar-actions">
            <LangSeg />
            <ThemeSeg />
            <SoundToggle />
            {user ? (
              <Link className="signin" href="/profile" aria-label={t('nav.profile')}>
                <span className="avatar" aria-hidden="true">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- provider avatar hosts are arbitrary; next/image would need an allow-list
                    <img src={user.image} alt="" />
                  ) : (
                    who.charAt(0).toUpperCase() || 'B'
                  )}
                </span>
                <span className="who">{who}</span>
              </Link>
            ) : (
              <Link className="signin" href="/sign-in?callbackUrl=/profile">{t('nav.signIn')}</Link>
            )}
            {join('btn btn-primary btn-sm magnetic', t('nav.join'), t('nav.joinAria'))}
            <button
              ref={menuBtn}
              className="menu-btn"
              type="button"
              aria-expanded={open}
              aria-controls="menu"
              aria-label={open ? t('menu.close') : t('menu.open')}
              onClick={() => (open ? closeMenu(true) : setOpen(true))}
            >
              <span /><span />
            </button>
          </div>
        </div>
      </header>

      <div className="menu" id="menu" ref={menu} hidden={!open} onClick={onMenuClick}>
        <nav aria-label={t('navMobile')}>
          {nav.map((item) => (
            <NavLink key={item.key} item={item} onHome={onHome} pathname={pathname}>
              <b>{t(`nav.${item.key}`)}</b><span>{item.numeral}</span>
            </NavLink>
          ))}
          {user ? (
            <>
              <Link href="/profile"><b>{who || t('nav.profile')}</b><span>→</span></Link>
              <button type="button" onClick={handleSignOut}><b>{t('nav.signOut')}</b><span>↗</span></button>
            </>
          ) : (
            <Link href="/sign-in?callbackUrl=/profile"><b>{t('nav.signIn')}</b><span>→</span></Link>
          )}
        </nav>
        <div className="menu-controls">
          <LangSeg />
          <ThemeSeg labelled />
          <SoundToggle labelled />
        </div>
        {join('btn btn-primary', tHome('primary'))}
        <p className="coord mono">RA 14h 29m 43s · Dec −62° 40′</p>
      </div>
    </>
  );
}
