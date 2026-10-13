'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Target, TrendingUp, Rocket, Code } from 'lucide-react';

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: i * 0.1,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

export default function MissionSection() {
  const t = useTranslations('mission');

  const pillars = [
    { key: 'ourMission', title: t('ourMission.title'), desc: t('ourMission.description') },
    { key: 'ourValues', title: t('ourValues.title'), desc: t('ourValues.description') },
    { key: 'ourCommunity', title: t('ourCommunity.title'), desc: t('ourCommunity.description') },
  ];

  const achievements = [
    { icon: Target, text: t('notACourse.achieveLaunch') },
    { icon: TrendingUp, text: t('notACourse.achieveValidation') },
    { icon: Rocket, text: t('notACourse.achieveRevenue') },
    { icon: Code, text: t('notACourse.achieveSkills') },
  ];

  return (
    <section className="py-section px-6 relative overflow-hidden">
      {/* Background treatment */}
      <div className="absolute inset-0 bg-card/30" />
      <div className="absolute inset-0 bg-gradient-radial-top from-primary/5 to-transparent opacity-50" />

      <div className="container mx-auto max-w-6xl relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-medium text-primary mb-4 tracking-wide uppercase">
            Our Philosophy
          </span>
          <h2 className="heading-section text-3xl sm:text-h1 lg:text-display-lg text-foreground mb-6">
            {t('title')}
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Three Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16">
          {pillars.map((pillar, index) => (
            <motion.div
              key={pillar.key}
              custom={index}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="relative p-8 rounded-2xl
                         bg-card/60 backdrop-blur-sm
                         border border-border/50
                         shadow-premium-sm
                         hover:border-primary/30 hover:shadow-premium
                         transition-all duration-350"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
              <h3 className="text-xl font-semibold text-foreground mb-4">
                {pillar.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {pillar.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Not a Course Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative rounded-3xl overflow-hidden
                     bg-gradient-to-br from-primary/10 via-primary/5 to-transparent
                     border border-primary/20
                     p-8 md:p-12"
        >
          {/* Decorative gradient orb */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-[100px]" />

          <div className="relative">
            <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6 text-center">
              {t('notACourse.title')}
            </h3>
            <p className="text-lg text-muted-foreground mb-10 text-center max-w-3xl mx-auto">
              {t('notACourse.subtitle')}
            </p>

            {/* Two column requirements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* You Need */}
              <div className="p-6 rounded-2xl bg-card/40 border border-success/20">
                <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {t('notACourse.youNeed')}
                </h4>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="text-success mt-0.5">-&gt;</span>
                    <span>{t('notACourse.youNeedTime')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-success mt-0.5">-&gt;</span>
                    <span>{t('notACourse.youNeedSkills')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-success mt-0.5">-&gt;</span>
                    <span>{t('notACourse.youNeedCommitment')}</span>
                  </li>
                </ul>
              </div>

              {/* You Don't Need */}
              <div className="p-6 rounded-2xl bg-card/40 border border-destructive/20">
                <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center text-destructive">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                  {t('notACourse.youDontNeed')}
                </h4>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="text-destructive mt-0.5">-&gt;</span>
                    <span>{t('notACourse.youDontNeedJob')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-destructive mt-0.5">-&gt;</span>
                    <span>{t('notACourse.youDontNeedTeam')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-destructive mt-0.5">-&gt;</span>
                    <span>{t('notACourse.youDontNeedBudget')}</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Achievements */}
            <div className="pt-8 border-t border-primary/20">
              <h4 className="text-lg font-semibold text-foreground mb-6 text-center">
                {t('notACourse.achieveTitle')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {achievements.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-muted-foreground">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="pt-1">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
