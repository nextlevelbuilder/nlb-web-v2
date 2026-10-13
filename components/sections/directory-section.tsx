import { useTranslations } from 'next-intl';
import LeaderboardResetCountdown from '@/components/home/leaderboard-reset-countdown';
import Reveal from '@/components/home/reveal';
import SectionPlate from '@/components/home/section-plate';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** Chapter IV · Directory (pillar 3): hand review, Trust Passport, organic 24h UTC leaderboard. */
export default function DirectorySection() {
  const t = useTranslations('home.directory');
  const principles = (['1', '2', '3'] as const).map((n) => ({ n, title: t(`p${n}t`), body: t(`p${n}d`) }));

  return (
    <section aria-labelledby="directory-title" className="section-pad">
      <div className="wrap">
        <SectionPlate numeral="IV" name={t('plate')} />
        <Reveal>
          <h2 id="directory-title" className="h-section max-w-[20ch]">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>
          <p className="lede mt-6 max-w-[52ch]">{t('body')}</p>
        </Reveal>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
          {principles.map((item) => (
            <li key={item.n} className="flex flex-col gap-3 bg-background p-6">
              <h3 className="font-display text-step-xl">{item.title}</h3>
              <p className="text-step-sm text-ink-2">{item.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <LeaderboardResetCountdown label={t('resetsIn')} />
          <p className="mono-label text-ink-3">{t('foot')}</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Button asChild size="lg">
            <Link href="/build-with-us/instructions">{t('ctaSubmit')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/leaderboards">{t('ctaBoard')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
