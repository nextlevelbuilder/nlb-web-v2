import { useTranslations } from 'next-intl';
import ChapterPlate from './chapter-plate';
import EarlyBirdCountdown from './early-bird-countdown';
import PricingPlans from './pricing-plans';
import SplitText from './split-text';

/** Chapter VI · ignition: early-bird countdown, billing switch, the two plans and the guarantee. */
export default function PricingChapter() {
  const t = useTranslations('home.pricing');
  const tTrust = useTranslations('home.trust');
  return (
    <section className="chapter section" id="pricing" aria-labelledby="pricing-title" data-ch="6">
      <div className="wrap">
        <ChapterPlate numeral="VI" name={t('plate')} coord="Vega · RA 18h 36m · Dec +38° 47′" />
        <div className="price-top">
          <div><SplitText id="pricing-title" className="h2" text={t.raw('title') as string} /></div>
          <EarlyBirdCountdown />
        </div>
        <PricingPlans />
        <p className="price-note"><span>{t('note')}</span><span>{tTrust('builders')}</span></p>
      </div>
    </section>
  );
}
