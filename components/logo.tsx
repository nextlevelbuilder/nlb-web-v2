'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ className = '', showText = true, size = 'md' }: LogoProps) {
  const sizes = {
    sm: { icon: 28, text: 'text-base' },
    md: { icon: 36, text: 'text-lg' },
    lg: { icon: 48, text: 'text-xl' },
  };

  const { icon, text } = sizes[size];

  return (
    <Link href="/" className={`group flex items-center gap-2.5 ${className}`}>
      {/* Icon Symbol */}
      <motion.div
        whileHover={{ scale: 1.05, rotate: 5 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className="relative"
      >
        {/* Glow effect on hover */}
        <div className="absolute inset-0 bg-primary/40 rounded-lg blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Icon container */}
        <div
          className="relative flex items-center justify-center rounded-lg bg-gradient-to-br from-primary via-primary to-cyan-500 shadow-lg shadow-primary/25"
          style={{ width: icon, height: icon }}
        >
          {/* Abstract "N" shape with arrow up - symbolizing "Next Level" */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-[60%] h-[60%]"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Stylized upward arrow/chevron */}
            <path d="M12 4L12 20" className="text-white" />
            <path d="M5 11L12 4L19 11" className="text-white" />
            {/* Decorative lines */}
            <path d="M7 17L12 12L17 17" className="text-white/60" />
          </svg>
        </div>
      </motion.div>

      {/* Brand Text */}
      {showText && (
        <div className="flex flex-col">
          <motion.span
            className={`font-heading font-bold tracking-tight leading-none ${text}
                       bg-gradient-to-r from-foreground via-foreground to-primary
                       bg-clip-text text-transparent
                       group-hover:from-primary group-hover:via-cyan-400 group-hover:to-primary
                       transition-all duration-300`}
          >
            Next Level
          </motion.span>
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Builders
          </span>
        </div>
      )}
    </Link>
  );
}
