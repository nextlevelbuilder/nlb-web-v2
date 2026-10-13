import { useTranslations } from 'next-intl';
import TeamMemberCard from '@/components/team-member-card';
import Reveal from '@/components/home/reveal';
import { FOUNDERS } from '@/lib/constants/home-content';

/** Founders block inside the proof chapter. */
export default function TeamSection() {
  const t = useTranslations('home.team');
  return (
    <section id="team" aria-labelledby="team-title" className="pt-section-sm">
      <div className="wrap">
        <Reveal>
          <h2 id="team-title" className="h-section max-w-[20ch] text-step-2xl">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>
          <p className="lede mt-4 max-w-[56ch] text-step-base">{t('subtitle')}</p>
        </Reveal>
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {FOUNDERS.map((founder) => (
            <li key={founder.id}>
              <TeamMemberCard founder={founder} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
