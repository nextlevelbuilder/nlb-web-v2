'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Logo from '@/components/logo';

export default function FooterSection() {
  const tFooter = useTranslations('footer');

  return (
    <footer className="py-12 px-6 border-t border-border/50 bg-card/20">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-3">
            <Logo size="md" />
            <p className="text-sm text-muted-foreground">
              {tFooter('tagline')}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href={process.env.NEXT_PUBLIC_DISCORD_URL || '#'}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tFooter('discord')}
            </Link>
            <Link
              href="https://twitter.com/nextlevelbuilders"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tFooter('twitter')}
            </Link>
            <Link
              href="https://github.com/nextlevelbuilder/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tFooter('github')}
            </Link>
            <Link
              href="/policies"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {tFooter('policies')}
            </Link>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border/50 text-center text-sm text-muted-foreground">
          <p>{tFooter('copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
