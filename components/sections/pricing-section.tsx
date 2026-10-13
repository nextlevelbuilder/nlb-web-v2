'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Shield, Zap, Users } from 'lucide-react';
import PricingCard from '@/components/pricing-card';
import PricingPlanSwitcher from '@/components/pricing-plan-switcher';
import { env } from '@/lib/env';

export default function PricingSection() {
  const [billingCycle, setBillingCycle] = useState<'quarterly' | 'yearly'>('yearly');
  const t = useTranslations('pricing');

  return (
    <section id="pricing" className="py-section px-6 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block text-sm font-medium text-primary mb-4 tracking-wide uppercase">
            Investment
          </span>
          <h2 className="heading-section text-3xl sm:text-h1 lg:text-display-lg text-foreground mb-6">
            {t('title')}
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            {t('subtitle')}
          </p>

          {/* Unified billing toggle */}
          <PricingPlanSwitcher
            selected={billingCycle}
            onChange={setBillingCycle}
          />
        </motion.div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto mb-12">
          {/* Premium Package */}
          <PricingCard
            name={billingCycle === 'quarterly'
              ? t('premium.quarterly.name')
              : t('premium.annual.name')
            }
            price={billingCycle === 'quarterly' ? 147 : 39}
            period={billingCycle === 'quarterly'
              ? t('premium.quarterly.period')
              : t('premium.annual.period')
            }
            productId={billingCycle === 'quarterly'
              ? env.NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM_QUARTERLY
              : env.NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM_ANNUAL
            }
            originalPrice={billingCycle === 'yearly' ? 147 : undefined}
            originalPeriod={billingCycle === 'yearly' ? t('premium.quarterly.period') : undefined}
            billingNote={billingCycle === 'quarterly'
              ? t('premium.quarterly.billingNote')
              : t('premium.annual.billingNote')
            }
            features={[
              t('premium.features.workshops'),
              t('premium.features.discord'),
              t('premium.features.videos'),
              t('premium.features.support'),
              t('premium.features.consult'),
            ]}
          />

          {/* VIP Package */}
          <PricingCard
            name={billingCycle === 'quarterly'
              ? t('vip.quarterly.name')
              : t('vip.annual.name')
            }
            price={billingCycle === 'quarterly' ? 297 : 79}
            period={billingCycle === 'quarterly'
              ? t('vip.quarterly.period')
              : t('vip.annual.period')
            }
            productId={billingCycle === 'quarterly'
              ? env.NEXT_PUBLIC_POLAR_PRODUCT_VIP_QUARTERLY
              : env.NEXT_PUBLIC_POLAR_PRODUCT_VIP_ANNUAL
            }
            originalPrice={billingCycle === 'yearly' ? 297 : undefined}
            originalPeriod={billingCycle === 'yearly' ? t('vip.quarterly.period') : undefined}
            billingNote={billingCycle === 'quarterly'
              ? t('vip.quarterly.billingNote')
              : t('vip.annual.billingNote')
            }
            popular={billingCycle === 'yearly'}
            features={[
              t('vip.features.allPremium'),
              t('vip.features.vipChannel'),
              t('vip.features.earlyAccess'),
              t('vip.features.article'),
              t('vip.features.vault'),
            ]}
          />
        </div>

        {/* Trust Signals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-8"
        >
          <TrustSignal icon={Shield} text={t('trustMoneyBack')} />
          <TrustSignal icon={Zap} text={t('trustPayment')} />
          <TrustSignal icon={Users} text={t('trustMembers')} />
        </motion.div>
      </div>
    </section>
  );
}

function TrustSignal({ icon: Icon, text }: { icon: typeof Shield; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <div className="w-9 h-9 rounded-full bg-success/10 border border-success/20
                      flex items-center justify-center">
        <Icon className="w-4 h-4 text-success" />
      </div>
      <span>{text}</span>
    </div>
  );
}
