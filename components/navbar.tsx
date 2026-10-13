'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Logo from '@/components/logo';
import LanguageSwitcher from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Sparkles, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

interface NavbarProps {
  onScrollToPricing?: () => void;
}

export default function Navbar({ onScrollToPricing }: NavbarProps) {
  const tNav = useTranslations('nav');
  const router = useRouter();
  const { data: session } = useSession();

  const handlePricingClick = (e: React.MouseEvent) => {
    if (onScrollToPricing) {
      e.preventDefault();
      onScrollToPricing();
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Logo size="sm" />

          {/* Desktop navigation links - Studio moved to Profile as requested */}
          <div className="hidden md:flex items-center gap-7">
            <Link
              href="/#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tNav('features')}
            </Link>
            <Link
              href="/build-with-us"
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200 flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {tNav('buildWithUs')}
            </Link>
            <Link
              href="/leaderboards"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tNav('leaderboards')}
            </Link>
            <Link
              href="/#pricing"
              onClick={handlePricingClick}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tNav('pricing')}
            </Link>
            <Link
              href="/#team"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tNav('team')}
            </Link>
            <Link
              href="/#faq"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tNav('faq')}
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />

            {session?.user ? (
              /* Authenticated User Menu: Profile Icon & Logout */
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="rounded-full gap-2 px-2.5 py-1 text-xs hover:bg-white/10"
                >
                  <Link href="/profile" title="View Builder Profile">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-cyan-500/20 border border-primary/40 flex items-center justify-center font-bold text-[11px] text-primary overflow-hidden shrink-0">
                      {session.user.image ? (
                        <img src={session.user.image} alt="User" className="w-full h-full object-cover" />
                      ) : (
                        (session.user.name || session.user.email || 'U').charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="hidden sm:inline font-semibold text-foreground max-w-[120px] truncate">
                      {session.user.name || 'Builder'}
                    </span>
                  </Link>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              /* Unauthenticated: Sign In & Join Now */
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground gap-1 px-3"
                >
                  <Link href="/sign-in?callbackUrl=/profile">
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In
                  </Link>
                </Button>

                <Button
                  asChild={!onScrollToPricing}
                  onClick={onScrollToPricing}
                  size="sm"
                  className="btn-premium"
                >
                  {onScrollToPricing ? (
                    <span>{tNav('joinNow')}</span>
                  ) : (
                    <Link href="/#pricing">{tNav('joinNow')}</Link>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
