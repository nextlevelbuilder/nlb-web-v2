import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { computeDirectoryPlot } from '@/lib/constellation/directory-plot';
import { HOME_LEADERBOARD_SIZE, type HomeLeaderboardEntry } from '@/lib/home/home-leaderboard';
import ChapterPlate from './chapter-plate';
import DirectoryHighlight from './directory-highlight';
import SplitText from './split-text';
import UtcResetClock from './utc-reset-clock';

const BAYER = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η'] as const;

/**
 * Chapter IV · magnitude: the real top products of today's organic leaderboard plotted as stars
 * (Trust ↑, votes →) next to the board. Empty places become "open magnitude" invitations to submit.
 */
export default function DirectoryChapter({ leaderboard }: { leaderboard: HomeLeaderboardEntry[] }) {
  const t = useTranslations('home.directory');
  const entries = leaderboard.slice(0, HOME_LEADERBOARD_SIZE);
  const plot = computeDirectoryPlot(entries.map((e) => ({ trust: e.trustScore, votes: e.votes })));
  const open = Math.max(0, HOME_LEADERBOARD_SIZE - entries.length);
  const leader = entries[0];

  return (
    <section className="chapter section" id="directory" aria-labelledby="dir-title" data-ch="4">
      <div className="wrap">
        <ChapterPlate numeral="IV" name={t('plate')} coord="Polaris · RA 02h 31m · Dec +89° 15′" />
        <div className="sec-head">
          <div className="sh-main">
            <SplitText id="dir-title" className="h2" text={t.raw('title') as string} />
            <p className="lede">{t('body')}</p>
          </div>
        </div>
        <div className="dir-grid">
          <figure className="surface plot">
            <figcaption className="plot-head mono"><span>{t('chart')}</span><span>{t('axes')}</span></figcaption>
            <svg
              id="plot"
              viewBox={`0 0 ${plot.width} ${plot.height}`}
              role="img"
              aria-label={leader ? t('chartAlt', { name: leader.title, trust: leader.trustScore }) : t('chartAltEmpty')}
            >
              {plot.trustTicks.map((tick) => (
                <g key={`t${tick.value}`}>
                  <line className="ax" x1={plot.left} x2={plot.right} y1={tick.pos} y2={tick.pos} />
                  <text className="ax-t" x={plot.left - 10} y={tick.pos + 3} textAnchor="end">{tick.value}</text>
                </g>
              ))}
              {plot.voteTicks.map((tick) => (
                <g key={`v${tick.value}`}>
                  <line className="ax" y1={plot.top} y2={plot.bottom} x1={tick.pos} x2={tick.pos} strokeDasharray="1 4" />
                  <text className="ax-t" y={plot.bottom + 18} x={tick.pos} textAnchor="middle">{tick.value}</text>
                </g>
              ))}
              {plot.stars.length > 1 && <polyline className="chain" points={plot.chain} />}
              {plot.stars.map((s, i) => (
                <g className="pstar" data-i={i} key={entries[i].slug}>
                  <circle className="ps-halo" cx={s.x} cy={s.y} r={s.haloR.toFixed(1)} />
                  <circle className="ps-core" cx={s.x} cy={s.y} r={s.r.toFixed(1)} style={{ opacity: s.opacity.toFixed(2) }} />
                  <text className="ps-lbl" x={s.labelX} y={s.labelY.toFixed(1)} textAnchor={s.labelAnchor}><tspan className="g">{BAYER[i]}</tspan> {entries[i].title}</text>
                  <text className="ps-g" x={s.greekX} y={s.greekY}>{BAYER[i]}</text>
                </g>
              ))}
            </svg>
            <p className="legend">
              <span className="mag" aria-hidden="true"><i style={{ width: 4, height: 4 }} /><i style={{ width: 7, height: 7 }} /><i style={{ width: 11, height: 11 }} /></span>
              <span>{t('legend')}</span>
            </p>
          </figure>
          <div className="surface board">
            <div className="board-head mono"><span>{t('top')}</span><span>{t('resets')} <UtcResetClock /> UTC</span></div>
            <ol className="lb">
              {entries.map((entry, i) => {
                const s = plot.stars[i];
                return (
                  <li className="lb-row" data-i={i} key={entry.slug} style={{ '--m': s.magnitude.toFixed(2) } as CSSProperties}>
                    <span className="bayer" aria-hidden="true">{BAYER[i]}</span>
                    <span className="lb-star" aria-hidden="true" />
                    <div className="lb-name">
                      <strong><Link className="lb-link" href={`/products/${entry.slug}`}>{entry.title}</Link></strong>
                      <span>{entry.tagline}</span>
                    </div>
                    <div className="lb-trust">
                      <span className="tv mono"><span>{t('trust')}</span><b>{entry.trustScore}</b></span>
                      <span className="mag-bar" aria-hidden="true"><i style={{ '--v': (entry.trustScore / 100).toFixed(2) } as CSSProperties} /></span>
                    </div>
                    <div className="lb-votes"><b className="num-tab">{entry.votes}</b><span className="mono">{t('votes')}</span></div>
                  </li>
                );
              })}
              {Array.from({ length: open }, (_, k) => {
                const i = entries.length + k;
                return (
                  <li className="lb-row is-open" key={`open-${i}`} style={{ '--m': '0.2' } as CSSProperties}>
                    <span className="bayer" aria-hidden="true">{BAYER[i]}</span>
                    <span className="lb-star" aria-hidden="true" />
                    <div className="lb-name">
                      <strong><Link className="lb-link" href="/build-with-us/instructions">{t('openTitle')}</Link></strong>
                      <span>{t('openSub')}</span>
                    </div>
                    <div className="lb-trust" aria-hidden="true"><span className="tv mono"><span>{t('trust')}</span><b>—</b></span><span className="mag-bar" /></div>
                    <div className="lb-votes" aria-hidden="true"><b className="num-tab">—</b><span className="mono">{t('votes')}</span></div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <div className="board-foot">
          <p className="mono">{t('foot')}</p>
          <div className="cta-row">
            <Link className="link-arrow" href="/leaderboards">{t('ctaBoard')} <span aria-hidden="true">→</span></Link>
            <a className="btn btn-ghost magnetic" href="#toolkits">{t('ctaSubmit')}</a>
          </div>
        </div>
        <DirectoryHighlight chapterId="directory" />
      </div>
    </section>
  );
}
