import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { HomeCourseVideo } from '@/lib/home/home-course-videos';
import ChapterPlate from './chapter-plate';
import CourseDrop from './course-drop';
import { LENS_COORDS, LENSES } from './course-lenses';
import SplitText from './split-text';

const FALLBACK = [
  { title: 's1t', body: 's1d' },
  { title: 's2t', body: 's2d' },
  { title: 's3t', body: 's3d' },
] as const;

/**
 * Chapter III · observatory: the latest published videos as lens cards (buy links go to the video
 * page). Before any video is published, the cards explain the weekly format instead, with no prices.
 */
export default function CoursesChapter({ videos }: { videos: HomeCourseVideo[] }) {
  const t = useTranslations('home.courses');
  const format = useFormatter();
  const price = (v: HomeCourseVideo) => format.number(v.priceCents / 100, { style: 'currency', currency: v.currency || 'USD', maximumFractionDigits: v.priceCents % 100 ? 2 : 0 });

  return (
    <section className="chapter section" id="courses" aria-labelledby="courses-title" data-ch="3">
      <div className="wrap">
        <ChapterPlate numeral="III" name={t('plate')} coord="M42 · RA 05h 35m · Dec −05° 23′" />
        <div className="sec-head">
          <div className="sh-main">
            <SplitText id="courses-title" className="h2" text={t.raw('title') as string} />
            <p className="lede">{t('body')}</p>
          </div>
          <div className="sh-side">
            <CourseDrop />
            <Link className="link-arrow" href="/courses">{t('all')} <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <div className="cards">
          {(videos.length ? videos : FALLBACK).map((item, i) => {
            const Lens = LENSES[i % LENSES.length];
            const video = 'slug' in item ? item : null;
            const obs = video?.weekNumber ?? 41 - i;
            return (
              <article key={video ? video.slug : item.title} className={i === 0 ? 'card feature' : 'card'}>
                <div className="lens">
                  <div className="lens-meta mono"><span>Obs. {obs} · {LENS_COORDS[i % LENS_COORDS.length]}</span><span className="badge">{t('badge')}</span></div>
                  <Lens />
                </div>
                <div className="card-body">
                  {video ? (
                    <>
                      <p className="card-meta mono">
                        {video.weekNumber !== null && <><span>{t('week', { week: video.weekNumber })}</span><span aria-hidden="true">·</span></>}
                        <span>{t('minutes', { minutes: Math.max(1, Math.round(video.durationSec / 60)) })}</span>
                      </p>
                      <h3>{video.title}</h3>
                      <div className="card-foot">
                        <small>{t('keep')}</small>
                        <Link className="btn btn-ghost btn-sm" href={`/courses/${video.slug}`} aria-label={t('buyAria', { price: price(video), title: video.title })}>
                          {video.priceCents > 0 ? t('buy', { price: price(video) }) : t('watch')}
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="card-meta mono"><span>{t('sampleMeta')}</span></p>
                      <h3>{t(item.title as (typeof FALLBACK)[number]['title'])}</h3>
                      <p className="card-desc">{t((item as (typeof FALLBACK)[number]).body)}</p>
                      <div className="card-foot">
                        <small>{t('keep')}</small>
                        <Link className="btn btn-ghost btn-sm" href="/courses">{t('cta')}</Link>
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
