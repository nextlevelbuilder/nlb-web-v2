'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Mail,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Github,
  Globe,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { authClient, signIn } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface AuthFormProps {
  initialMode?: 'signin' | 'signup';
}

export default function AuthForm({ initialMode = 'signin' }: AuthFormProps) {
  const t = useTranslations('auth');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCallback = searchParams.get('callbackUrl') || searchParams.get('callbackURL');
  // Only local continuations may be used by the ordinary sign-in flow.
  const callbackUrl = requestedCallback?.startsWith('/') && !requestedCallback.startsWith('//') && !/[\\\x00-\x20]/.test(requestedCallback)
    ? requestedCallback : '/studio';
  const isOAuth = searchParams.has('sig') && searchParams.has('ba_param');

  // Step 1: Send OTP to email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError(t('invalidEmail'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const sendOtpFunc =
        (authClient as any).emailOtp?.sendVerificationOtp ||
        (authClient as any).emailOTP?.sendVerificationOTP ||
        (authClient as any).sendVerificationOTP;

      const res = await sendOtpFunc({
        email: email.trim().toLowerCase(),
        type: 'sign-in',
      });

      if ((res as any)?.error) {
        throw new Error((res as any).error.message || t('sendFailed'));
      }

      setStep('otp');
      setSuccess(t('otpSentSuccess', { email }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and Sign In
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.trim().length < 6) {
      setError(t('invalidOtp'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const verifyOtpFunc =
        (signIn as any).emailOtp ||
        (signIn as any).emailOTP ||
        (authClient as any).signIn?.emailOtp;

      const res = await verifyOtpFunc({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });

      if ((res as any)?.error) {
        throw new Error((res as any).error.message || t('verifyFailed'));
      }

      if (isOAuth) {
        // The provider verifies the signed query and returns the next consent step.
        const nextUrl = (res as any)?.data?.url;
        if (typeof nextUrl !== 'string') throw new Error('Could not continue authorization. Please restart from your MCP client.');
        window.location.assign(nextUrl);
        return;
      }

      setSuccess(t('loginSuccess'));
      setTimeout(() => {
        router.push(callbackUrl);
        router.refresh();
      }, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('verifyFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Social OAuth Handler
  const handleSocialSignIn = async (provider: 'github' | 'google') => {
    setLoading(true);
    setError(null);
    try {
      const res = await signIn.social({
        provider,
        callbackURL: callbackUrl,
      });
      if ((res as any)?.error) {
        throw new Error((res as any).error.message || `${provider} OAuth is not yet configured.`);
      }
    } catch {
      setError(
        t('oauthNotConfigured', { provider: provider.toUpperCase() })
      );
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 sm:p-10 bg-white/[0.02] border-white/10 rounded-3xl max-w-md w-full mx-auto space-y-6 shadow-2xl backdrop-blur-xl">
      {/* Header Badge & Title */}
      <div className="text-center space-y-2">
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-xs px-3 py-1">
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5 inline text-emerald-400" />
          {t('badge')}
        </Badge>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
          {step === 'email' ? t('signInTitle') : t('otpTitle')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {step === 'email'
            ? t('signInDesc')
            : t('otpDesc', { email })}
        </p>
      </div>

      {/* Error & Success Feedback */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Step 1 Form: Email Input */}
      {step === 'email' && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('emailLabel')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-foreground placeholder:text-muted-foreground/40 text-sm focus:outline-none focus:border-primary"
                required
                autoFocus
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl gap-2 font-bold shadow-lg btn-premium py-6 mt-2"
          >
            {loading ? t('sendingOtp') : t('sendOtpBtn')}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>
      )}

      {/* Step 2 Form: 6-Digit OTP Verification */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <div className="space-y-2 text-center">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('otpLabel')}
            </label>
            <div className="relative max-w-[240px] mx-auto">
              <input
                type="text"
                placeholder="123456"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center tracking-[12px] font-mono text-2xl py-3 rounded-2xl bg-black/50 border border-primary/40 text-primary placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary font-extrabold shadow-inner"
                required
                autoFocus
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || otp.length < 6}
            className="w-full rounded-xl gap-2 font-bold shadow-lg btn-premium py-6"
          >
            {loading ? t('verifying') : t('verifyOtpBtn')}
            <CheckCircle2 className="w-4 h-4" />
          </Button>

          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError(null);
                setSuccess(null);
              }}
              className="hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('changeEmail')}
            </button>

            <button
              type="button"
              onClick={(e) => handleSendOtp(e as any)}
              disabled={loading}
              className="hover:text-primary flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('resendOtp')}
            </button>
          </div>
        </form>
      )}

      {/* Social 1-Click Login Options (Step 1 only) */}
      {step === 'email' && (
        <div className="space-y-3 pt-2">
          <div className="relative flex items-center justify-center">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-background px-3 text-[10px] text-muted-foreground uppercase font-mono tracking-wider absolute">
              {t('orSocial')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleSocialSignIn('github')}
              className="rounded-xl gap-2 text-xs border-white/10 hover:bg-white/5 py-5"
            >
              <Github className="w-4 h-4" />
              GitHub
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleSocialSignIn('google')}
              className="rounded-xl gap-2 text-xs border-white/10 hover:bg-white/5 py-5"
            >
              <Globe className="w-4 h-4 text-primary" />
              Google
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
