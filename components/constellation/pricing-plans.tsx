'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useTranslations } from 'next-intl';
import CheckoutConfirmDialog from '@/components/checkout/checkout-confirm-dialog';
import { useCheckoutDeepLink } from '@/components/checkout/use-checkout-deep-link';
import { useCheckout } from '@/components/home/checkout-context';
import { MEMBERSHIP_PLAN_NAMES, MEMBERSHIP_PRICES, type BillingCycle, type MembershipPlan } from '@/lib/constants/launch';
import type { PlanSeats } from '@/lib/home/membership-seats';
import { seatStatus } from '@/lib/home/seat-meter';

const RING = 289.03;

interface PlanSpec {
  plan: MembershipPlan;
  kicker: string;
  whoKey: 'premiumWho' | 'vipWho';
  features: ReadonlyArray<{ key: string; hi?: boolean }>;
}

const PLANS: PlanSpec[] = [
  { plan: 'premium', kicker: 'Premium · mag 1.4', whoKey: 'premiumWho', features: [{ key: 'p1' }, { key: 'p2' }, { key: 'p3' }, { key: 'p4' }] },
  { plan: 'vip', kicker: 'VIP · mag 0.0', whoKey: 'vipWho', features: [{ key: 'v1' }, { key: 'v2' }, { key: 'v3' }, { key: 'v4' }, { key: 'v5' }, { key: 'v6', hi: true }] },
];

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Share of the ring to fill: the real taken share only when the meter is shown; full when sold out. */
function takenShare(seats: PlanSeats | null): number {
  if (!seats) return 0;
  const status = seatStatus(seats);
  if (status === 'soldOut') return 1;
  return status === 'meter' && seats.total > 0 ? seats.taken / seats.total : 0;
}

function PlanStar({ vip, taken }: { vip: boolean; taken: number }) {
  return (
    <div className="plan-star" aria-hidden="true">
      <svg viewBox="-50 -50 100 100">
        <circle className="ring-track" r="46" />
        <circle className="ring-fill" r="46" strokeDasharray={RING} strokeDashoffset={(RING * (1 - taken)).toFixed(2)} transform="rotate(-90)" data-taken={taken.toFixed(3)} />
        {vip ? (
          <>
            <circle className="phalo" r="24" />
            <path className="pspk" d="M-34 0H34M0-34V34" />
            <path className="pspk" d="M-14-14L14 14M-14 14L14-14" opacity=".45" />
            <circle className="pcore" r="7" />
          </>
        ) : (
          <>
            <circle className="phalo" r="16" />
            <path className="pspk" d="M-20 0H20M0-20V20" opacity=".5" />
            <circle className="pcore" r="4.5" />
          </>
        )}
      </svg>
    </div>
  );
}

function SeatLine({ seats }: { seats: PlanSeats }) {
  const t = useTranslations('home.pricing');
  const status = seatStatus(seats);
  return (
    <div className="seats">
      <p className="seats-row">
        {status === 'soldOut' && <b className="sold">{t('soldOut')}</b>}
        {status === 'meter' && <b>{t('seatsLeft', { left: seats.left, total: seats.total })}</b>}
        {status === 'cap' && <b>{t('limited', { total: seats.total })}</b>}
        <span>{t('thisRound')}</span>
      </p>
      {status === 'meter' && (
        <span className="meter" aria-hidden="true">
          <i style={{ ['--v' as string]: (seats.taken / seats.total).toFixed(3) }} />
        </span>
      )}
    </div>
  );
}

/**
 * Billing switch and the two plan cards. Prices are the real launch prices; seat lines follow the
 * seat rule (live count only once half the seats are taken). Each Join button opens the
 * pre-checkout dialog (Terms consent, then Polar).
 */
export default function PricingPlans() {
  const t = useTranslations('home.pricing');
  const { billing, setBilling, seats, isAvailable } = useCheckout();
  const plansRef = useRef<HTMLDivElement>(null);
  const premium = MEMBERSHIP_PRICES.premium;
  const savePercent = Math.round(((premium.quarterly.amount * 4 - premium.annual.amount) / (premium.quarterly.amount * 4)) * 100);

  const deepLink = useCheckoutDeepLink();
  useEffect(() => {
    if (deepLink) setBilling(deepLink.billing);
  }, [deepLink, setBilling]);

  const choose = (next: BillingCycle) => {
    if (next === billing) return;
    setBilling(next);
    const amounts = plansRef.current?.querySelectorAll('.price .amt');
    if (amounts?.length && !reduceMotion()) {
      gsap.fromTo(amounts, { yPercent: 30, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.06 });
    }
  };

  return (
    <>
      <div className="billing">
        <div className="seg" role="group" aria-label={t('period')}>
          <button type="button" aria-pressed={billing === 'quarterly'} onClick={() => choose('quarterly')}>{t('quarterly')}</button>
          <button type="button" aria-pressed={billing === 'annual'} onClick={() => choose('annual')}>{t('annual')}</button>
        </div>
        <span className="save mono">{t('save', { percent: savePercent })}</span>
      </div>
      <div className="plans" ref={plansRef}>
        {PLANS.map(({ plan, kicker, whoKey, features }) => {
          const vip = plan === 'vip';
          const name = MEMBERSHIP_PLAN_NAMES[plan];
          const prices = MEMBERSHIP_PRICES[plan];
          const annual = billing === 'annual';
          const amount = annual ? prices.annual.perMonth : prices.quarterly.amount;
          const per = annual ? t('perMonth') : t('perQuarter');
          const saving = prices.quarterly.amount * 4 - prices.annual.amount;
          const planSeats = seats?.[plan] ?? null;
          const available = isAvailable(plan);
          const headingId = `pl-${plan}`;
          const btnClass = `btn ${vip ? 'btn-primary' : 'btn-ghost'} magnetic`;
          return (
            <article key={plan} className={`surface plan${vip ? ' vip' : ''}`} data-plan={plan} aria-labelledby={headingId}>
              {vip && <span className="badge ribbon">{t('ribbon')}</span>}
              <div className="plan-top">
                <PlanStar vip={vip} taken={takenShare(planSeats)} />
                <div>
                  <p className="plan-kicker mono">{kicker}</p>
                  <h3 id={headingId}>{name}</h3>
                  <p className="who">{t(whoKey)}</p>
                </div>
              </div>
              <div><p className="price"><span className="amt">${amount}</span><span className="per">{per}</span></p></div>
              <p className="price-sub">
                {annual ? t('subAnnualTotal', { total: prices.annual.amount, saving }) : t('subQuarterly', { perMonth: prices.quarterly.perMonth })}
              </p>
              {planSeats && <SeatLine seats={planSeats} />}
              <ul className="feats">
                {features.map((f) => <li key={f.key} className={f.hi ? 'hi' : undefined}>{t(f.key)}</li>)}
              </ul>
              {available ? (
                <CheckoutConfirmDialog plan={plan} source={`pricing-${plan}`} openRequest={deepLink?.plan === plan ? deepLink.nonce : undefined}>
                  <button type="button" className={btnClass} aria-label={t('joinAria', { plan: name, price: `$${amount}`, per })}>
                    {t('join', { plan: name })}
                  </button>
                </CheckoutConfirmDialog>
              ) : (
                <button type="button" className={btnClass} disabled>{t('soldOut')}</button>
              )}
              <p className="risk">{t('risk')}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}
