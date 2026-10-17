import { useTranslations } from 'next-intl';
import { ArrowIcon } from './constellation-icons';
import SplitText from './split-text';

/** Chapter VIII · your star: the gathered star ignites over #ignite; hovering the CTA flares it. */
export default function FinaleChapter() {
  const t = useTranslations('home');
  return (
    <section className="chapter finale" id="finale" aria-labelledby="finale-title" data-ch="8">
      <div className="wrap">
        <span className="ignite-anchor" id="ignite" aria-hidden="true" />
        <p className="coord mono">{t('finale.coord')}</p>
        <SplitText id="finale-title" className="h2" text={t.raw('finale.title') as string} />
        <a className="btn btn-primary magnetic" href="#pricing" id="finale-cta"><span>{t('cta.primary')}</span><ArrowIcon /></a>
        <p className="risk">{t('finale.risk')}</p>
      </div>
    </section>
  );
}
