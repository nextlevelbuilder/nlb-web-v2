import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowIcon } from './constellation-icons';
import Planisphere from './planisphere';
import SplitText from './split-text';

const rise = (i: number) => ({ '--ri': i }) as CSSProperties;

/** Chapter 0 · first light: planisphere, live cursor coordinates and the split hero. */
export default function HookChapter() {
  const t = useTranslations('home');

  return (
    <section className="chapter hook" id="hook" aria-labelledby="hook-title" data-ch="0">
      <Planisphere />
      <div className="hook-meta" aria-hidden="true">
        <div className="wrap mono">
          <p><span>{t('hook.metaL')}</span><br />RA 14h 29m 43s · Dec −62° 40′</p>
          <p className="hm-right"><span>{t('hook.metaR')}</span><br /><span className="live" id="cursor-coord">RA 12h 00m 00s · Dec +00° 00′</span></p>
        </div>
      </div>
      <div className="wrap hook-copy">
        <div className="hook-title-wrap">
          <p className="eyebrow mono intro-up" style={rise(0)}>{t('hook.eyebrow')}</p>
          <SplitText as="h1" id="hook-title" className="h1" text={t.raw('hook.title') as string} />
        </div>
        <div className="hook-side">
          <p className="lede intro-up" style={rise(1)}>{t('hook.sub')}</p>
          <div className="cta-row intro-up" style={rise(2)}>
            <a className="btn btn-primary magnetic" href="#pricing"><span>{t('cta.primary')}</span><ArrowIcon /></a>
            <a className="btn btn-ghost magnetic" href="#courses">
              <span className="play" aria-hidden="true"><svg viewBox="0 0 8 8"><path d="M0 0l8 4-8 4z" fill="currentColor" /></svg></span>
              <span>{t('hook.ctaSecondary')}</span>
            </a>
          </div>
          <ul className="trust intro-up" style={rise(3)}>
            <li>{t('trust.moneyBack')}</li>
            <li>{t('trust.polar')}</li>
            <li>{t('trust.builders')}</li>
          </ul>
        </div>
      </div>
      <div className="scroll-cue mono" aria-hidden="true"><span>{t('hook.scroll')}</span><i /></div>
    </section>
  );
}
