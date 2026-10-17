import { useTranslations } from 'next-intl';
import ChapterPlate from './chapter-plate';
import SplitText from './split-text';

const FEATURES = [
  { greek: 'α', title: 'f1t', body: 'f1d' },
  { greek: 'β', title: 'f2t', body: 'f2d' },
  { greek: 'γ', title: 'f3t', body: 'f3d' },
] as const;

/** Chapter II · constellation: the in-flow slot the particles snap into, spelling NLB. */
export default function CommunityChapter() {
  const t = useTranslations('home.community');
  return (
    <section className="chapter community" id="community" aria-labelledby="community-title" data-ch="2">
      <div className="wrap">
        <ChapterPlate numeral="II" name={t('plate')} coord="M45 · RA 03h 47m · Dec +24° 07′" />
        <div className="const-stage" aria-hidden="true">
          <div className="const-box" id="const-box" />
          <p className="const-label mono"><span className="latin">Constructores</span><span>{t('label')}</span></p>
        </div>
        <div className="community-grid">
          <div className="c-left">
            <SplitText id="community-title" className="h2" text={t.raw('title') as string} />
            <p className="lede">{t('body')}</p>
          </div>
          <ul className="c-right feats-c">
            {FEATURES.map((f) => (
              <li key={f.greek} className="fc">
                <span className="greek" aria-hidden="true">{f.greek}</span>
                <div><h3>{t(f.title)}</h3><p>{t(f.body)}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
