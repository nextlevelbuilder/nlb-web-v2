'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, Sparkles } from 'lucide-react';
import TcModal from '@/components/tc-modal';

interface PricingCardProps {
  name: string;
  price: number;
  period: string;
  features: string[];
  productId: string;
  popular?: boolean;
  originalPrice?: number;
  originalPeriod?: string;
  billingNote?: string;
  packageType?: 'premium' | 'vip';
}

export default function PricingCard({
  name,
  price,
  period,
  features,
  productId,
  popular = false,
  originalPrice,
  originalPeriod,
  billingNote,
}: PricingCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTcModal, setShowTcModal] = useState(false);

  const handleCheckout = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      if (!response.ok) throw new Error('Failed to create checkout session');
      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group relative"
    >
      {/* Popular badge */}
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full
                          bg-gradient-to-r from-primary to-cyan-500
                          text-white text-sm font-semibold
                          shadow-lg shadow-primary/30">
            <Sparkles className="w-3.5 h-3.5" />
            Most Popular
          </div>
        </div>
      )}

      {/* Card */}
      <div className={`relative h-full rounded-2xl overflow-hidden
                       transition-all duration-350 ease-premium
                       ${popular
                         ? 'bg-card border-2 border-primary shadow-xl shadow-primary/20'
                         : 'bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/30 hover:shadow-premium'
                       }`}>

        {/* Inner highlight for popular */}
        {popular && (
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        )}

        <div className="relative p-8">
          {/* Header */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-6">
              {name}
            </h3>

            {/* Price */}
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl text-muted-foreground">$</span>
              <span className="text-6xl font-bold text-foreground tracking-tight">
                {price}
              </span>
              <span className="text-lg text-muted-foreground ml-1">
                /{period}
              </span>
            </div>

            {/* Original price / savings */}
            {originalPrice && (
              <div className="flex items-center gap-3 mt-3">
                <span className="text-base text-muted-foreground line-through">
                  ${originalPrice}/{originalPeriod || period}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold
                                 bg-success/20 text-success border border-success/30">
                  Save ${originalPrice - price}
                </span>
              </div>
            )}

            {/* Billing note */}
            {billingNote && (
              <p className="text-sm text-muted-foreground mt-3">
                {billingNote}
              </p>
            )}
          </div>

          {/* Features */}
          <ul className="space-y-4 mb-8">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full
                                bg-success/20 flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-success" strokeWidth={3} />
                </div>
                <span className="text-base text-muted-foreground leading-relaxed">
                  {feature}
                </span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="space-y-3">
            <Button
              onClick={() => setShowTcModal(true)}
              disabled={loading}
              className={`w-full h-13 text-base font-semibold
                          transition-all duration-250 ease-premium
                          ${popular
                            ? 'btn-premium bg-primary shadow-lg shadow-primary/30'
                            : 'bg-primary/90 hover:bg-primary hover:shadow-glow-primary'
                          }`}
            >
              {loading ? 'Processing...' : `Get ${name}`}
            </Button>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <p className="text-xs text-muted-foreground text-center pt-2">
              30-day money-back guarantee
            </p>
          </div>

          {/* T&C Modal — user must scroll to end before proceeding */}
          <TcModal
            open={showTcModal}
            onOpenChange={setShowTcModal}
            onAccept={handleCheckout}
            loading={loading}
          />
        </div>
      </div>
    </motion.div>
  );
}
