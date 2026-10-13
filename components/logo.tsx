import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { mark: 24, text: 'text-[1.05rem]' },
  md: { mark: 30, text: 'text-[1.2rem]' },
  lg: { mark: 40, text: 'text-[1.5rem]' },
} as const;

/** Constellation mark: three linked stars rising to a brighter fourth. Decorative; the link carries the name. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <path d="M5 25 L12 17 L19 20 L26 7" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />
      <circle cx="5" cy="25" r="1.6" fill="currentColor" />
      <circle cx="12" cy="17" r="1.6" fill="currentColor" />
      <circle cx="19" cy="20" r="1.6" fill="currentColor" />
      <path d="M26 2.5 L27.2 5.8 L30.5 7 L27.2 8.2 L26 11.5 L24.8 8.2 L21.5 7 L24.8 5.8 Z" className="fill-primary" />
    </svg>
  );
}

/** Brand lockup linking to the localized homepage. */
export default function Logo({ className, showText = true, size = 'md' }: LogoProps) {
  const t = useTranslations('shell');
  const { mark, text } = SIZES[size];

  return (
    <Link
      href="/"
      aria-label={t('home')}
      className={cn('group inline-flex min-h-[44px] items-center gap-2.5 rounded-sm text-foreground', className)}
    >
      <LogoMark size={mark} className="transition-transform duration-slow ease-expo group-hover:-translate-y-0.5" />
      {showText && (
        <span className={cn('font-display font-medium leading-none tracking-tight', text)}>
          Next Level <em className="font-normal italic text-primary">Builders</em>
        </span>
      )}
    </Link>
  );
}
