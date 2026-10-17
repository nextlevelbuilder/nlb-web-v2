import { useTranslations } from 'next-intl';
import ChapterPlate from './chapter-plate';
import SplitText from './split-text';

/** Chapter I · the dark: the field dims while the sentence lights up word by word. */
export default function DarkChapter() {
  const t = useTranslations('home.dark');
  return (
    <section className="chapter dark" id="dark" aria-labelledby="dark-title" data-ch="1">
      <div className="wrap">
        <ChapterPlate numeral="I" name={t('plate')} coord="Coalsack · RA 12h 50m · Dec −62° 30′" />
        <SplitText id="dark-title" className="dark-text" mode="fade" text={t.raw('title') as string} />
        <p className="caption mono">{t('caption')}</p>
      </div>
    </section>
  );
}
