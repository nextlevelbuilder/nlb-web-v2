'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import TeamMemberCard from '@/components/team-member-card';

const teamData = [
  {
    name: 'Duy Nguyen',
    title: 'CTO/Co-founder of T.O.P Group Vietnam, Founder of "Build in Public VN" Community',
    photo: '/docs/assets/duy.png',
    expertise: ['Profile Building', 'Community Growth', 'Content Viral', 'Product Marketing'],
    trackRecord: 'Managing 3 companies, build 14+ SaaS products ($100K+ ARR), grow Facebook profile from 0->18K followers in 2 years, recruit 50k+ members to Build in Public VN community in 1 year, grow Substack to 1.4K+ subscribers in 1 month',
    social: {
      twitter: 'https://x.com/goon_nguyen',
      facebook: 'https://facebook.com/mrgoonie',
    },
  },
  {
    name: 'Cuong Vo',
    title: 'CEO of EGANY',
    photo: '/docs/assets/cuong.png',
    expertise: ['Pre-order Campaigns', 'Conversion', 'Sales Automation'],
    trackRecord: 'Founder for 11 years at EGANY serving over 10k+ businesses. $20k USD pre-order campaign before having a product.',
    social: {
      facebook: 'https://www.facebook.com/voquoccuong007',
    },
  },
  {
    name: 'Viet Tran',
    title: 'Founder & Solution Architect of 200lab',
    photo: '/docs/assets/viet.png',
    expertise: ['High-load Architectures', 'Flash Sale', 'Black Friday'],
    trackRecord: '15+ years of experience developing software systems. Expert in high-load architectures: Flash Sale, Black Friday. Peak CCU ~400k. Coach/Mentor to over 3000 students. Consultant for system transformation and scaling for over 30 businesses.',
    social: {
      facebook: 'https://www.facebook.com/viettranx',
    },
  },
];

export default function TeamSection() {
  const t = useTranslations('team');

  return (
    <section id="team" className="py-section px-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-card/30" />

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
            Meet The Experts
          </span>
          <h2 className="heading-section text-3xl sm:text-h1 lg:text-display-lg text-foreground mb-6">
            {t('title')}
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Team Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {teamData.map((member) => (
            <TeamMemberCard
              key={member.name}
              {...member}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
