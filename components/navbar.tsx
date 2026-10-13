'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut, Menu, X } from 'lucide-react';
import Logo from '@/components/logo';
import LanguageSwitcher from '@/components/language-switcher';
import ThemeToggle from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useSession, signOut } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

interface NavbarProps {
  /** Homepage only: scroll to the in-page pricing section instead of navigating. */
  onScrollToPricing?: () => void;
}

const PRICING_HREF = { pathname: '/', hash: 'pricing' } as const;

const NAV_LINKS = [
  { key: 'courses', href: '/courses' },
  { key: 'directory', href: '/build-with-us' },
  { key: 'leaderboard', href: '/leaderboards' },
  { key: 'blog', href: '/blog' },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Site header rendered by every page. It owns the skip link and the `#main-content` focus target so
 * keyboard users can bypass navigation on any page, regardless of how that page marks up its main.
 */
export default function Navbar({ onScrollToPricing }: NavbarProps) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => desktop.matches && closeMenu();
    document.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onResize);
    document.body.style.overflow = 'hidden';
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onResize);
      document.body.style.overflow = '';
    };
  }, [open, closeMenu]);

  const handlePricing = (event: MouseEvent) => {
    closeMenu();
    if (onScrollToPricing) {
      event.preventDefault();
      onScrollToPricing();
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      closeMenu();
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const user = session?.user;
  const linkClass = (active: boolean) =>
    cn(
      'inline-flex min-h-[44px] items-center text-step-sm transition-colors duration-base hover:text-foreground',
      active ? 'text-foreground' : 'text-ink-2',
    );

  const links = (onNavigate?: () => void) => (
    <>
      {NAV_LINKS.map(({ key, href }) => {
        const active = isActive(pathname, href);
        return (
          <li key={key}>
            <Link href={href} className={linkClass(active)} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
              {t(`nav.${key}`)}
            </Link>
          </li>
        );
      })}
      <li>
        <Link href={PRICING_HREF} className={linkClass(false)} onClick={handlePricing}>
          {t('nav.pricing')}
        </Link>
      </li>
    </>
  );

  const account = user ? (
    <div className="flex items-center gap-1">
      <Link
        href="/profile"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-pill px-2 text-step-sm text-foreground hover:bg-accent"
        aria-label={t('nav.profile')}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface font-mono text-[11px]" aria-hidden="true">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- provider avatar hosts are arbitrary; next/image would need an allow-list
            <img src={user.image} alt="" className="h-full w-full object-cover" />
          ) : (
            (user.name || user.email || 'B').charAt(0).toUpperCase()
          )}
        </span>
        <span className="hidden max-w-[120px] truncate xl:inline">{user.name || user.email}</span>
      </Link>
      <Button type="button" variant="ghost" size="icon" onClick={handleSignOut} aria-label={t('nav.signOut')} title={t('nav.signOut')}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  ) : (
    <Link href="/sign-in?callbackUrl=/profile" className={linkClass(false)}>
      {t('nav.signIn')}
    </Link>
  );

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t('skip')}
      </a>
      <header className="fixed inset-x-0 top-0 z-50 h-header border-b border-line bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="wrap flex h-full items-center justify-between gap-4">
          <Logo size="sm" />

          <nav aria-label={t('navPrimary')} className="hidden lg:block">
            <ul className="flex items-center gap-7">{links()}</ul>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              <ThemeToggle />
              <LanguageSwitcher />
              {account}
            </div>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href={PRICING_HREF} onClick={handlePricing} aria-label={t('nav.joinAria')}>
                {t('nav.join')}
              </Link>
            </Button>
            <Button
              ref={toggleRef}
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t('menu.close') : t('menu.open')}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </Button>
          </div>
        </div>

        <div
          id="mobile-menu"
          ref={menuRef}
          hidden={!open}
          className="fixed inset-x-0 bottom-0 top-header overflow-y-auto border-t border-line bg-background lg:hidden"
        >
          <nav aria-label={t('navMobile')} className="wrap flex flex-col gap-8 py-8">
            <ul className="flex flex-col gap-1 font-display text-step-xl">{links(() => setOpen(false))}</ul>
            <div className="flex flex-col gap-4 border-t border-line pt-6">
              <ThemeToggle labelled className="self-start" />
              <LanguageSwitcher className="self-start" />
              {account}
              <Button asChild className="sm:hidden">
                <Link href={PRICING_HREF} onClick={handlePricing}>
                  {t('nav.join')}
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      </header>
      <span id="main-content" tabIndex={-1} className="block h-0 outline-none" />
    </>
  );
}
