'use client';

import { useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { MembershipPlan } from '@/lib/constants/launch';
import CheckoutConfirmPanel from './checkout-confirm-panel';

interface CheckoutConfirmDialogProps {
  plan: MembershipPlan;
  /** Scopes progress and error messages to the widget that opened the dialog. */
  source: string;
  /** The CTA button; it becomes the dialog trigger and receives focus back when the dialog closes. */
  children: ReactElement;
  /** A new value opens the dialog without a click (checkout deep links). */
  openRequest?: number;
}

/**
 * Pre-checkout confirmation. Radix Dialog provides the modal semantics: focus trap, Esc to close, focus
 * returned to the trigger, and the title/description wired to aria-labelledby/aria-describedby.
 */
export default function CheckoutConfirmDialog({ plan, source, children, openRequest }: CheckoutConfirmDialogProps) {
  const t = useTranslations('home.checkout');
  const [open, setOpen] = useState(false);
  const [seenRequest, setSeenRequest] = useState<number>();
  if (openRequest !== seenRequest) {
    setSeenRequest(openRequest);
    if (openRequest) setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent closeLabel={t('close')} className="max-h-[90svh] w-[calc(100%-2rem)] overflow-y-auto motion-reduce:animate-none">
        <DialogHeader className="pr-10">
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription className="text-step-sm text-ink-2">{t('dialogDescription')}</DialogDescription>
        </DialogHeader>
        <CheckoutConfirmPanel plan={plan} source={source} />
      </DialogContent>
    </Dialog>
  );
}
