import { Resend } from "resend";
import { env } from "./env";
import crypto from "crypto";

export const resend = new Resend(env.RESEND_API_KEY || "dummy_key_for_build");
const formUrl = env.FORM01_LARK_URL;

export interface WelcomeEmailProps {
  name: string;
  email: string;
  discordInvite: string;
  idempotencyKey?: string;
}

export async function sendWelcomeEmail({ name, email, discordInvite, idempotencyKey }: WelcomeEmailProps) {
  try {
    const hash = idempotencyKey
      ? crypto.createHash("sha256").update(`${idempotencyKey}:${name || ""}:${email}`).digest("hex").slice(0, 16)
      : undefined;
    const effectiveKey = idempotencyKey ? `nlb-welcome-${email.toLowerCase().trim()}-${hash}` : undefined;
    const options = effectiveKey ? { idempotencyKey: effectiveKey } : {};
    const emailPayload = {
      from: `Next Level Builders <${env.RESEND_FROM_EMAIL}>`,
      to: [email],
      subject: "Chào mừng bạn đến với Next Level Builders! 🚀",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
          <h1 style="color: #2563eb; font-size: 24px; margin-bottom: 16px;">Chào mừng ${name || "bạn"} đến với Next Level Builders!</h1>
          <p style="font-size: 16px; line-height: 1.6; color: #4b5563;">Cảm ơn bạn đã đăng ký thành viên. Hãy tham gia Discord cộng đồng ngay:</p>
          <div style="margin: 24px 0;">
            <a href="${discordInvite}" style="background-color: #5865F2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Tham gia Discord</a>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">Nếu có bất kỳ câu hỏi nào, hãy phản hồi trực tiếp email này.</p>
        </div>
      `,
    };

    const result = await resend.emails.send(emailPayload, options);

    if (result.error) {
      console.error("Error sending welcome email:", result.error);
      return { success: false, error: result.error };
    }

    console.log("✓ Welcome email sent:", result.data);
    return { success: true, data: result.data };
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return { success: false, error };
  }
}

/**
 * Send secure 6-digit OTP login verification code via Resend
 */
export async function sendOtpEmail({ email, otp, type }: { email: string; otp: string; type: string }) {
  try {
    const subject = `Mã xác thực đăng nhập: ${otp} | Next Level Builders`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #0d1117; color: #f0f6fc; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #58a6ff; margin: 0; font-size: 24px;">Next Level Builders</h2>
          <p style="color: #8b949e; font-size: 13px; margin-top: 4px;">Mã OTP Đăng Nhập An Toàn</p>
        </div>
        <p style="color: #c9d1d9; font-size: 14px; line-height: 1.6;">Xin chào,</p>
        <p style="color: #c9d1d9; font-size: 14px; line-height: 1.6;">Dưới đây là mã xác thực 6 chữ số để đăng nhập vào tài khoản Builder của bạn:</p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #58a6ff; padding: 12px 24px; background: rgba(88,166,255,0.1); border: 1px solid rgba(88,166,255,0.3); border-radius: 12px; font-family: monospace;">
            ${otp}
          </span>
        </div>
        <p style="color: #8b949e; font-size: 12px; line-height: 1.5;">Mã này có hiệu lực trong vòng 10 phút. Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.</p>
        <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />
        <p style="color: #8b949e; font-size: 11px; text-align: center; margin: 0;">© ${new Date().getFullYear()} Next Level Builders. All rights reserved.</p>
      </div>
    `;

    const fromEmail = env.RESEND_FROM_EMAIL || "hello@nextlevelbuilder.io";
    const result = await resend.emails.send({
      from: `Next Level Builders <${fromEmail}>`,
      to: [email],
      subject,
      html,
    });

    console.log(`✓ Sent OTP email to ${email}:`, result);
    return { success: true };
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return { success: false, error };
  }
}
