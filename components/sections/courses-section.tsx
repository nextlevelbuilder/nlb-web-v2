import { useTranslations } from 'next-intl';
import CourseDropNotice from '@/components/home/course-drop-notice';
import Reveal from '@/components/home/reveal';
import SectionPlate from '@/components/home/section-plate';
import { Link } from '@/i18n/navigation';

/** Chapter III · Courses (pillar 2): weekly videos, buy singly, VIP watches all. */
export default function CoursesSection() {
  const t = useTranslations('home.courses');
  const steps = (['1', '2', '3'] as const).map((n) => ({ n, title: t(`s${n}t`), body: t(`s${n}d`) }));

  return (
    <section aria-labelledby="courses-title" className="section-pad">
      <div className="wrap">
        <SectionPlate numeral="III" name={t('plate')} />
        <Reveal>
          <h2 id="courses-title" className="h-section max-w-[18ch]">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>
          <p className="lede mt-6 max-w-[52ch]">{t('body')}</p>
        </Reveal>
        <CourseDropNotice title={t('dropTitle')} className="mt-12" />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.n} className="surface-panel flex flex-col gap-3 p-6">
              <span className="plate-numeral" aria-hidden="true">0{step.n}</span>
              <h3 className="font-display text-step-xl">{step.title}</h3>
              <p className="text-step-sm text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/courses" className="link-arrow mt-10">
          {t('cta')} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
