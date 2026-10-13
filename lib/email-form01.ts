import { resend } from "./resend";
import { env } from "./env";
import crypto from "crypto";

export interface Form01EmailProps {
  name: string;
  email: string;
  idempotencyKey?: string;
}

/**
 * Send Form 01 (Member Info) email after checkout confirmed.
 * Contains link to LarkSuite form for member information collection.
 */
export async function sendForm01Email({ name, email, idempotencyKey }: Form01EmailProps) {
  const formUrl = env.FORM01_LARK_URL;
  const hash = idempotencyKey
    ? crypto.createHash("sha256").update(`${idempotencyKey}:${name || ""}:${email}`).digest("hex").slice(0, 16)
    : undefined;
  const effectiveKey = idempotencyKey ? `nlb-form01-${email.toLowerCase().trim()}-${hash}` : undefined;
  const options = effectiveKey ? { idempotencyKey: effectiveKey } : {};
  try {
    const emailPayload = {
      from: `Next Level Builders <${env.RESEND_FROM_EMAIL}>`,
      to: [email],
      subject: "[NLB] Cập nhật thông tin thành viên - Form 01",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cập nhật thông tin thành viên</title>
</head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Cập nhật thông tin thành viên</h1>
  </div>

  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 18px; margin-top: 0;">Xin chào ${name || "bạn"},</p>

    <p>Cảm ơn bạn đã đăng ký tham gia <strong>Next Level Builders</strong>! 🎉</p>

    <p>Để hoàn tất quy trình onboarding, vui lòng điền thông tin cá nhân qua form bên dưới. Thông tin này giúp BQT xác minh và hỗ trợ bạn tốt hơn trong cộng đồng.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${formUrl}" style="display: inline-block; background: linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(14,165,233,0.3);">Điền Form Thông Tin</a>
    </div>

    <div style="background: #f0f9ff; border-left: 4px solid #0EA5E9; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
      <p style="margin: 0; font-weight: 600; color: #0369a1;">⏰ Lưu ý quan trọng</p>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #0369a1;">
        <li>Vui lòng hoàn thành form trong vòng <strong>1-2 ngày</strong></li>
        <li>BQT sẽ xem xét và xác minh trong <strong>2-3 ngày</strong> sau đó</li>
        <li>Sau khi xác minh, bạn sẽ nhận email tiếp theo với Form Cam kết</li>
      </ul>
    </div>

    <p>Nếu bạn có bất kỳ câu hỏi nào, hãy liên hệ qua email hoặc kênh #support trên Discord.</p>

    <p style="margin-top: 30px; margin-bottom: 0;">
      <strong>Ban Quản Trị Next Level Builders</strong><br>
      <span style="color: #6b7280; font-size: 14px;">Duy Nguyen • Cuong Vo • Viet Tran</span>
    </p>
  </div>

  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 14px;">
    <p style="margin: 0;">© ${new Date().getFullYear()} Next Level Builders. All rights reserved.</p>
    <p style="margin: 10px 0 0 0;">
      <a href="https://x.com/nextlevelbuilders" style="color: #0EA5E9; text-decoration: none; margin: 0 10px;">X</a>
      <a href="https://fb.com/nextlevelbuilders" style="color: #0EA5E9; text-decoration: none; margin: 0 10px;">Facebook</a>
      <a href="https://www.linkedin.com/nextlevelbuilders" style="color: #0EA5E9; text-decoration: none; margin: 0 10px;">LinkedIn</a>
    </p>
  </div>
</body>
</html>
      `,
    };
    const result = await resend.emails.send(emailPayload, options);
    if (result.error) {
      console.error("Error sending Form 01 email:", result.error);
      return { success: false, error: result.error };
    }

    console.log("✓ Form 01 email sent:", result.data);
    return { success: true, data: result.data };
  } catch (error) {
    console.error("Error sending Form 01 email:", error);
    return { success: false, error };
  }
}
