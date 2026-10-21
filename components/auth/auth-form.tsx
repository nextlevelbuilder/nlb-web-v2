'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Mail,
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
import { isInvalidOAuthSignatureError, isOAuthSignInQuery } from '@/lib/auth-oauth-sign-in-link';

/** Email OTP creates the account on first verification, so sign-in and sign-up share one form. */
type AuthResult = { error?: { message?: string } | null; data?: { url?: unknown } | null } | null | undefined;
type OtpSender = (args: { email: string; type: 'sign-in' }) => Promise<AuthResult>;
type OtpVerifier = (args: { email: string; otp: string }) => Promise<AuthResult>;
/** better-auth's emailOTP plugin method names changed between releases; probe the known spellings. */
type EmailOtpClient = {
  emailOtp?: { sendVerificationOtp?: OtpSender };
  emailOTP?: { sendVerificationOTP?: OtpSender };
  sendVerificationOTP?: OtpSender;
  signIn?: { emailOtp?: OtpVerifier };
};
type EmailOtpSignIn = { emailOtp?: OtpVerifier; emailOTP?: OtpVerifier };

export default function AuthForm() {
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
  const isOAuth = isOAuthSignInQuery(searchParams);
  /** An expired authorize link cannot be repaired here; the user must restart from their app. */
  const failureMessage = (error: NonNullable<NonNullable<AuthResult>['error']>, fallback: string) =>
    isOAuth && isInvalidOAuthSignatureError(error) ? t('oauthLinkExpired') : error.message || fallback;

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
      const client = authClient as unknown as EmailOtpClient;
      const sendOtpFunc =
        client.emailOtp?.sendVerificationOtp ||
        client.emailOTP?.sendVerificationOTP ||
        client.sendVerificationOTP;
      if (!sendOtpFunc) throw new Error(t('sendFailed'));

      const res = await sendOtpFunc({
        email: email.trim().toLowerCase(),
        type: 'sign-in',
      });

      if (res?.error) {
        throw new Error(failureMessage(res.error, t('sendFailed')));
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
      const signInMethods = signIn as unknown as EmailOtpSignIn;
      const verifyOtpFunc =
        signInMethods.emailOtp ||
        signInMethods.emailOTP ||
        (authClient as unknown as EmailOtpClient).signIn?.emailOtp;
      if (!verifyOtpFunc) throw new Error(t('verifyFailed'));

      const res = await verifyOtpFunc({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });

      if (res?.error) {
        throw new Error(failureMessage(res.error, t('verifyFailed')));
      }

      if (isOAuth) {
        // The provider verifies the signed query and returns the next consent step.
        const nextUrl = res?.data?.url;
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
      const socialResult = res as AuthResult;
      if (socialResult?.error) {
        throw new Error(socialResult.error.message || `${provider} OAuth is not yet configured.`);
      }
    } catch {
      setError(
        t('oauthNotConfigured', { provider: provider.toUpperCase() })
      );
      setLoading(false);
    }
  };

  const fieldClass =
    'w-full rounded-sm border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <Card className="mx-auto w-full max-w-md space-y-7 bg-surface/90 p-6 shadow-constellation backdrop-blur-md sm:p-10">
      <div className="space-y-3 text-center">
        <p className="eyebrow justify-center">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-primary" />
          {t('badge')}
        </p>
        <h1 className="font-display text-step-2xl font-light leading-tight">
          {step === 'email' ? t('signInTitle') : t('otpTitle')}
        </h1>
        <p className="text-step-sm text-ink-2">{step === 'email' ? t('signInDesc') : t('otpDesc', { email })}</p>
      </div>

      <div aria-live="polite" className="space-y-3 empty:hidden">
        {error && (
          <p role="alert" className="flex items-start gap-2.5 rounded-sm border border-destructive/40 bg-destructive/10 p-3.5 text-step-sm text-destructive">
            <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {success && (
          <p role="status" className="flex items-start gap-2.5 rounded-sm border border-success/40 bg-success/10 p-3.5 text-step-sm text-success">
            <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </p>
        )}
      </div>

      {step === 'email' && (
        <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label htmlFor="auth-email" className="mono-label text-ink-2">
              {t('emailLabel')}
            </label>
            <div className="relative">
              <Mail aria-hidden className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${fieldClass} h-12 pl-10 pr-4 text-step-base`}
                required
                autoFocus
              />
            </div>
          </div>

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? t('sendingOtp') : t('sendOtpBtn')}
            <ArrowRight aria-hidden />
          </Button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-5" noValidate>
          <div className="space-y-2 text-center">
            <label htmlFor="auth-otp" className="mono-label text-ink-2">
              {t('otpLabel')}
            </label>
            <input
              id="auth-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              placeholder="123456"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className={`${fieldClass} mx-auto block h-14 max-w-[240px] text-center font-mono text-step-xl tracking-[0.5em]`}
              required
              autoFocus
            />
          </div>

          <Button type="submit" size="lg" disabled={loading || otp.length < 6} className="w-full">
            {loading ? t('verifying') : t('verifyOtpBtn')}
            <CheckCircle2 aria-hidden />
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-2 text-step-sm text-ink-2">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError(null);
                setSuccess(null);
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
              {t('changeEmail')}
            </button>

            <button
              type="button"
              onClick={(e) => handleSendOtp(e as unknown as React.FormEvent)}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center gap-1.5 transition-colors hover:text-primary disabled:opacity-50"
            >
              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              {t('resendOtp')}
            </button>
          </div>
        </form>
      )}

      {step === 'email' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3" role="presentation">
            <span className="h-px flex-1 bg-line" />
            <span className="mono-label text-ink-3">{t('orSocial')}</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <Button type="button" variant="outline" disabled={loading} onClick={() => handleSocialSignIn('github')}>
              <Github aria-hidden />
              GitHub
            </Button>
            <Button type="button" variant="outline" disabled={loading} onClick={() => handleSocialSignIn('google')}>
              <Globe aria-hidden />
              Google
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
