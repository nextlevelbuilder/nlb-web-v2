'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Quote } from 'lucide-react';

interface TestimonialCardProps {
  name: string;
  title: string;
  quote: string;
  result: string;
  photo: string;
  index?: number;
}

export default function TestimonialCard({
  name,
  title,
  quote,
  result,
  photo,
  index = 0,
}: TestimonialCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
    >
      <Quote className="w-8 h-8 text-primary/30" />

      <p className="text-sm text-muted-foreground leading-relaxed italic">
        &ldquo;{quote}&rdquo;
      </p>

      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <div className="relative w-12 h-12 flex-shrink-0">
          <Image
            src={photo}
            alt={name}
            fill
            className="rounded-full object-cover border-2 border-primary/20"
            sizes="(max-width: 768px) 48px, 48px"
          />
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold font-mono text-success">{result}</p>
          <p className="text-xs text-muted-foreground">Growth</p>
        </div>
      </div>
    </motion.div>
  );
}
