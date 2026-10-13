/** UI copy for the Courses pages, kept here (not messages/*.json) so the feature ships self-contained. */
export type CoursesLocale = "en" | "vi";

export interface CoursesCopy {
  listTitle: string;
  listSubtitle: string;
  empty: string;
  week: (n: number) => string;
  minutes: (n: number) => string;
  watch: string;
  back: string;
  lockedTitle: string;
  lockedBody: string;
  buyOption: (price: string) => string;
  vipOption: string;
  buyButton: (price: string) => string;
  vipButton: string;
  signInToBuy: string;
  loadingPlayer: string;
  playerError: string;
  retry: string;
  checkoutError: string;
  paymentPending: string;
  unavailable: string;
}

const en: CoursesCopy = {
  listTitle: "Courses",
  listSubtitle: "Recorded build sessions. Buy a single video, or join VIP to unlock every one.",
  empty: "No videos published yet. Check back soon.",
  week: (n) => `Week ${n}`,
  minutes: (n) => `${n} min`,
  watch: "View video",
  back: "All videos",
  lockedTitle: "This video is locked",
  lockedBody: "Choose how you want to unlock it:",
  buyOption: (price) => `Buy this video once for ${price} and keep access to it.`,
  vipOption: "Join the VIP plan to watch every course video while your membership is active.",
  buyButton: (price) => `Buy for ${price}`,
  vipButton: "See VIP plan",
  signInToBuy: "Sign in to buy",
  loadingPlayer: "Loading player…",
  playerError: "We could not load the player.",
  retry: "Try again",
  checkoutError: "We could not start checkout. Please try again.",
  paymentPending: "Payment received. Access unlocks as soon as Polar confirms the order, usually within a minute.",
  unavailable: "Playback is temporarily unavailable. Please try again later.",
};

const vi: CoursesCopy = {
  listTitle: "Khoá học",
  listSubtitle: "Các buổi build đã ghi hình. Mua lẻ từng video, hoặc tham gia VIP để mở khoá tất cả.",
  empty: "Chưa có video nào được xuất bản. Hãy quay lại sau nhé.",
  week: (n) => `Tuần ${n}`,
  minutes: (n) => `${n} phút`,
  watch: "Xem video",
  back: "Tất cả video",
  lockedTitle: "Video này đang bị khoá",
  lockedBody: "Chọn cách mở khoá:",
  buyOption: (price) => `Mua riêng video này với giá ${price} và xem lại bất cứ lúc nào.`,
  vipOption: "Tham gia gói VIP để xem toàn bộ video khoá học trong thời gian hội viên còn hiệu lực.",
  buyButton: (price) => `Mua với giá ${price}`,
  vipButton: "Xem gói VIP",
  signInToBuy: "Đăng nhập để mua",
  loadingPlayer: "Đang tải trình phát…",
  playerError: "Không thể tải trình phát.",
  retry: "Thử lại",
  checkoutError: "Không thể bắt đầu thanh toán. Vui lòng thử lại.",
  paymentPending: "Đã nhận thanh toán. Quyền xem sẽ mở ngay khi Polar xác nhận đơn hàng, thường trong vòng một phút.",
  unavailable: "Tạm thời không thể phát video. Vui lòng thử lại sau.",
};

const COPY: Record<CoursesLocale, CoursesCopy> = { en, vi };

export function toCoursesLocale(locale: string): CoursesLocale {
  return locale === "en" ? "en" : "vi";
}

export function getCoursesCopy(locale: string): CoursesCopy {
  return COPY[toCoursesLocale(locale)];
}

/** Format integer minor units (cents) for display, e.g. 1900 usd -> "$19.00". */
export function formatCoursePrice(priceCents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
