import type { PageLocale } from "./page-locale";

/** Copy for the VietQR bank-transfer checkout page (`/checkout/bank-transfer`). */
export type BankTransferPageCopy = {
  metaTitle: string;
  eyebrow: string;
  title: string;
  lede: string;
  creating: string;
  createError: string;
  signInPrompt: string;
  signIn: string;
  unavailable: string;
  qrAlt: string;
  bank: string;
  account: string;
  amount: string;
  content: string;
  contentHint: string;
  copy: string;
  copied: string;
  waiting: string;
  paid: string;
  paidMembership: (until: string) => string;
  mismatch: string;
  continueOnboarding: string;
  watchCourse: string;
  backHome: string;
};

export const bankTransferPageCopy: Record<PageLocale, BankTransferPageCopy> = {
  en: {
    metaTitle: "Pay by bank transfer",
    eyebrow: "VietQR bank transfer",
    title: "Scan to pay in VND",
    lede: "Scan the QR with any Vietnamese banking app. The amount and transfer content are filled in for you.",
    creating: "Preparing your transfer order…",
    createError: "We couldn't create the transfer order. Please try again or email hello@nextlevelbuilder.io.",
    signInPrompt: "Sign in first so the payment is linked to your account.",
    signIn: "Sign in to continue",
    unavailable: "Bank transfer isn't available for this product.",
    qrAlt: "VietQR code for this order",
    bank: "Bank",
    account: "Account number",
    amount: "Amount",
    content: "Transfer content",
    contentHint: "Keep this code in the transfer content exactly, or the payment can't be matched.",
    copy: "Copy",
    copied: "Copied",
    waiting: "Waiting for your transfer. This page updates on its own within a minute of payment.",
    paid: "Payment received. Your access is active.",
    paidMembership: (until) => `Payment received. Your membership is active until ${until}. It does not renew automatically.`,
    mismatch: "We received a transfer with a different amount. Email hello@nextlevelbuilder.io with your order code and we'll sort it out.",
    continueOnboarding: "Continue to onboarding",
    watchCourse: "Back to the course",
    backHome: "Back to home",
  },
  vi: {
    metaTitle: "Thanh toán chuyển khoản",
    eyebrow: "Chuyển khoản VietQR",
    title: "Quét mã để thanh toán bằng VND",
    lede: "Quét mã QR bằng ứng dụng ngân hàng bất kỳ. Số tiền và nội dung chuyển khoản đã được điền sẵn.",
    creating: "Đang tạo đơn chuyển khoản…",
    createError: "Chưa tạo được đơn chuyển khoản. Bạn thử lại hoặc email hello@nextlevelbuilder.io nhé.",
    signInPrompt: "Bạn đăng nhập trước để khoản thanh toán gắn đúng vào tài khoản của mình.",
    signIn: "Đăng nhập để tiếp tục",
    unavailable: "Sản phẩm này chưa hỗ trợ thanh toán chuyển khoản.",
    qrAlt: "Mã VietQR của đơn hàng",
    bank: "Ngân hàng",
    account: "Số tài khoản",
    amount: "Số tiền",
    content: "Nội dung chuyển khoản",
    contentHint: "Giữ nguyên mã này trong nội dung chuyển khoản, nếu không hệ thống sẽ không khớp được đơn.",
    copy: "Sao chép",
    copied: "Đã chép",
    waiting: "Đang chờ chuyển khoản. Trang sẽ tự cập nhật trong khoảng một phút sau khi bạn thanh toán.",
    paid: "Đã nhận thanh toán. Quyền truy cập của bạn đã được kích hoạt.",
    paidMembership: (until) => `Đã nhận thanh toán. Gói thành viên có hiệu lực đến ${until} và không tự gia hạn.`,
    mismatch: "Chúng mình nhận được khoản chuyển với số tiền khác đơn hàng. Bạn email hello@nextlevelbuilder.io kèm mã đơn để được hỗ trợ nhé.",
    continueOnboarding: "Tiếp tục onboarding",
    watchCourse: "Quay lại khoá học",
    backHome: "Về trang chủ",
  },
};
