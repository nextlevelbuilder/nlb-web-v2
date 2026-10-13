'use client';

import { motion } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

interface PricingPlanSwitcherProps {
  selected: 'quarterly' | 'yearly';
  onChange: (plan: 'quarterly' | 'yearly') => void;
  quarterlyLabel?: string;
  yearlyLabel?: string;
  savingsLabel?: string;
}

export default function PricingPlanSwitcher({
  selected,
  onChange,
  quarterlyLabel = 'Quarterly',
  yearlyLabel = 'Yearly',
  savingsLabel = 'Save 26%',
}: PricingPlanSwitcherProps) {
  const quarterlyRef = useRef<HTMLButtonElement>(null);
  const yearlyRef = useRef<HTMLButtonElement>(null);
  const [dimensions, setDimensions] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (selected === 'quarterly' && quarterlyRef.current) {
        setDimensions({
          left: quarterlyRef.current.offsetLeft,
          width: quarterlyRef.current.offsetWidth,
        });
      } else if (selected === 'yearly' && yearlyRef.current) {
        setDimensions({
          left: yearlyRef.current.offsetLeft,
          width: yearlyRef.current.offsetWidth,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [selected]);

  return (
    <div className="flex items-center justify-center">
      <div className="relative inline-flex items-center gap-2 bg-card border-2 border-border rounded-full p-1.5">
        {/* Sliding background indicator */}
        <motion.div
          className="absolute top-1.5 h-[calc(100%-12px)] bg-primary rounded-full"
          initial={false}
          animate={{
            left: dimensions.left,
            width: dimensions.width,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
        />

        {/* Quarterly button */}
        <button
          ref={quarterlyRef}
          onClick={() => onChange('quarterly')}
          className={`relative z-10 px-4 py-2 rounded-full text-sm font-semibold transition-colors duration-200 whitespace-nowrap ${
            selected === 'quarterly'
              ? 'text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {quarterlyLabel}
        </button>

        {/* Yearly button */}
        <button
          ref={yearlyRef}
          onClick={() => onChange('yearly')}
          className={`relative z-10 px-4 py-2 rounded-full text-sm font-semibold transition-colors duration-200 flex items-center gap-1.5 whitespace-nowrap ${
            selected === 'yearly'
              ? 'text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>{yearlyLabel}</span>
          <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
            {savingsLabel}
          </span>
        </button>
      </div>
    </div>
  );
}
