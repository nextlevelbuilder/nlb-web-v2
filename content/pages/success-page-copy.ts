import type { PageLocale } from "./page-locale";

/** Copy for the post-checkout welcome page (`/success`). */
export type SuccessPageCopy = {
  metaTitle: string;
  eyebrow: string;
  title: string;
  lede: string;
  nextStepsTitle: string;
  nextSteps: string[];
  joinDiscord: string;
  backHome: string;
  troublePrefix: string;
};

export const successPageCopy: Record<PageLocale, SuccessPageCopy> = {
  en: {
    metaTitle: "Welcome",
    eyebrow: "Payment confirmed",
    title: "Welcome to Next Level Builders",
    lede: "Your payment was successful. Check your email for next steps!",
    nextStepsTitle: "What happens next?",
    nextSteps: [
      "Check your email for a welcome message with Discord invite link",
      "Join our Discord server and introduce yourself",
      "Access exclusive resources in the #resources channel",
      "Browse the recorded session library and watch new weekly drops",
    ],
    joinDiscord: "Join Discord Now",
    backHome: "Back to Home",
    troublePrefix: "Having trouble? Email us at",
  },
  vi: {
    metaTitle: "Chào mừng",
    eyebrow: "Đã xác nhận thanh toán",
    title: "Chào mừng đến với Next Level Builders",
    lede: "Thanh toán của bạn đã thành công. Hãy kiểm tra email để xem các bước tiếp theo!",
    nextStepsTitle: "Tiếp theo là gì?",
    nextSteps: [
      "Kiểm tra email chào mừng có kèm đường dẫn mời vào Discord",
      "Tham gia máy chủ Discord và giới thiệu bản thân",
      "Truy cập tài nguyên độc quyền trong kênh #resources",
      "Xem thư viện buổi học đã ghi hình và các drop mới hàng tuần",
    ],
    joinDiscord: "Tham gia Discord ngay",
    backHome: "Về trang chủ",
    troublePrefix: "Gặp sự cố? Gửi email cho chúng tôi tại",
  },
};
