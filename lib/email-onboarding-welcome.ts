import { resend } from "./resend";
import { env } from "./env";
import { defaultLocale, isLocale, type Locale } from "@/i18n/routing";
import { onboardingPath } from "@/lib/onboarding/flags";
import { PROVIDER_FETCH_TIMEOUT_MS, ProviderError } from "@/lib/community/types";

export interface OnboardingWelcomeEmailProps {
  email: string;
  name?: string | null;
  locale?: string | null;
  /** Stable per subscription so retried jobs never send twice (Resend keeps keys for 24h). */
  idempotencyKey: string;
}

const COPY: Record<Locale, { subject: string; greeting: (name: string) => string; body: string; cta: string; footer: string }> = {
  en: {
    subject: "Welcome to Next Level Builders: finish your setup",
    greeting: (name) => `Welcome, ${name}!`,
    body: "Your membership is confirmed. Sign in with this email to finish onboarding: a short form, then link Discord and Telegram to get your community access automatically.",
    cta: "Finish onboarding",
    footer: "Questions? Just reply to this email.",
  },
  vi: {
    subject: "Chào mừng bạn đến với Next Level Builders: hoàn tất thiết lập",
    greeting: (name) => `Chào mừng ${name}!`,
    body: "Gói thành viên của bạn đã được xác nhận. Đăng nhập bằng email này để hoàn tất onboarding: điền một form ngắn, rồi liên kết Discord và Telegram để được cấp quyền vào cộng đồng tự động.",
    cta: "Hoàn tất onboarding",
    footer: "Có câu hỏi? Hãy trả lời trực tiếp email này.",
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function onboardingUrl(locale: Locale, appUrl: string = env.NEXT_PUBLIC_APP_URL): string {
  return `${appUrl.replace(/\/+$/, "")}${onboardingPath(locale)}`;
}

export function renderOnboardingWelcomeEmail({ name, locale }: { name?: string | null; locale?: string | null }) {
  const resolved: Locale = isLocale(locale) ? locale : defaultLocale;
  const copy = COPY[resolved];
  const displayName = escapeHtml(name?.trim() || (resolved === "vi" ? "bạn" : "builder"));
  const url = onboardingUrl(resolved);
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h1 style="font-size: 22px; margin: 0 0 16px;">${copy.greeting(displayName)}</h1>
      <p style="font-size: 16px; line-height: 1.6; color: #4b5563;">${copy.body}</p>
      <div style="margin: 24px 0;">
        <a href="${url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">${copy.cta}</a>
      </div>
      <p style="font-size: 14px; color: #6b7280;">${copy.footer}</p>
    </div>
  `;
  const text = `${copy.greeting(name?.trim() || (resolved === "vi" ? "bạn" : "builder"))}\n\n${copy.body}\n\n${copy.cta}: ${url}\n\n${copy.footer}`;
  return { subject: copy.subject, html, text, url };
}

/**
 * Send the welcome email. The Resend SDK takes no abort signal, so the call is bounded by racing a
 * timer: after `PROVIDER_FETCH_TIMEOUT_MS` it fails with a retryable `resend_timeout`, and the
 * idempotency key keeps a late first attempt and the retry from both delivering.
 */
export async function sendOnboardingWelcomeEmail({ email, name, locale, idempotencyKey }: OnboardingWelcomeEmailProps) {
  const { subject, html, text } = renderOnboardingWelcomeEmail({ name, locale });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError("resend_timeout", { retryable: true })), PROVIDER_FETCH_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([
      resend.emails.send(
        { from: `Next Level Builders <${env.RESEND_FROM_EMAIL}>`, to: [email], subject, html, text },
        { idempotencyKey }
      ),
      timeout,
    ]);
    if (result.error) return { success: false as const, error: result.error };
    return { success: true as const, data: result.data };
  } catch (error) {
    return { success: false as const, error };
  } finally {
    clearTimeout(timer);
  }
}
