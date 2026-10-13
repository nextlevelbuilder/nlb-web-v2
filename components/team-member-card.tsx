'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { Facebook, Twitter } from 'lucide-react';

interface TeamMemberCardProps {
  name: string;
  title: string;
  photo: string;
  expertise: string[];
  trackRecord: string;
  social?: {
    twitter?: string;
    facebook?: string;
  };
}

export default function TeamMemberCard({
  name,
  title,
  photo,
  expertise,
  trackRecord,
  social,
}: TeamMemberCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="group"
    >
      <div className="relative h-full rounded-2xl overflow-hidden
                      bg-card/60 backdrop-blur-sm
                      border border-border/50
                      shadow-premium-sm
                      transition-all duration-350 ease-premium
                      group-hover:border-primary/30
                      group-hover:shadow-premium">

        {/* Photo section */}
        <div className="relative h-64 overflow-hidden">
          <Image
            src={photo}
            alt={name}
            fill
            className="object-cover object-top
                       transition-transform duration-500 ease-premium
                       group-hover:scale-105"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t
                          from-card via-card/20 to-transparent" />

          {/* Social links overlay */}
          {social && (
            <div className="absolute bottom-4 right-4 flex gap-2
                            opacity-0 translate-y-2
                            group-hover:opacity-100 group-hover:translate-y-0
                            transition-all duration-300">
              {social.twitter && (
                <SocialLink href={social.twitter} icon={Twitter} />
              )}
              {social.facebook && (
                <SocialLink href={social.facebook} icon={Facebook} />
              )}
            </div>
          )}
        </div>

        {/* Content section */}
        <div className="p-6">
          <h3 className="text-xl font-semibold text-foreground mb-1">
            {name}
          </h3>
          <p className="text-sm text-primary mb-4">{title}</p>

          {/* Expertise tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {expertise.map((skill, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 text-xs font-medium
                           bg-primary/10 text-primary
                           rounded-full border border-primary/20"
              >
                {skill}
              </span>
            ))}
          </div>

          {/* Track record */}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {trackRecord}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function SocialLink({ href, icon: Icon }: { href: string; icon: typeof Twitter }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-9 h-9 rounded-full
                 bg-card/80 backdrop-blur-sm
                 border border-border/50
                 flex items-center justify-center
                 hover:bg-primary hover:border-primary
                 transition-all duration-200"
    >
      <Icon className="w-4 h-4 text-foreground" />
    </Link>
  );
}
