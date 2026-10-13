'use client';

import { useRef, type KeyboardEvent } from 'react';
import type { BillingCycle } from '@/lib/constants/launch';
import { cn } from '@/lib/utils';

interface PricingPlanSwitcherProps {
  value: BillingCycle;
  onChange: (value: BillingCycle) => void;
  label: string;
  options: Record<BillingCycle, string>;
  /** Short note shown next to the annual option, e.g. "Save 20%". */
  annualNote?: string;
  className?: string;
}

const ORDER: BillingCycle[] = ['quarterly', 'annual'];

/** Billing-cycle radio group (Quarterly · Annual) with roving focus and arrow-key support. */
export default function PricingPlanSwitcher({ value, onChange, label, options, annualNote, className }: PricingPlanSwitcherProps) {
  const refs = useRef<Record<BillingCycle, HTMLButtonElement | null>>({ quarterly: null, annual: null });

  const onKeyDown = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = ORDER[(ORDER.indexOf(value) + 1) % ORDER.length];
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn('seg', className)} onKeyDown={onKeyDown}>
      {ORDER.map((option) => (
        <button
          key={option}
          ref={(node) => {
            refs.current[option] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === option}
          tabIndex={value === option ? 0 : -1}
          onClick={() => onChange(option)}
          className="seg-option gap-2 px-4"
        >
          {options[option]}
          {option === 'annual' && annualNote && (
            <span className={cn('rounded-pill px-1.5 py-0.5 text-[10px]', value === option ? 'bg-background/20' : 'text-primary')}>
              {annualNote}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
