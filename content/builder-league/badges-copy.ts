import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { BadgeRarity } from "@/lib/builder-league/badges";
import type { Stage } from "@/lib/builder-league/types";

/**
 * Builder League progression copy shared by the badges page, the Kill Board and the progression shell
 * (section navigation and access gate used by every page of this piece).
 */
export type BadgesCopy = {
  shell: {
    navLabel: string;
    nav: Record<"badges" | "missions" | "seasons" | "rewards" | "shipRelay" | "killBoard" | "timeCapsule", string>;
    signInTitle: string;
    signInBody: string;
    signInCta: string;
    membershipTitle: string;
    membershipBody: string;
    membershipCta: string;
    pilotNote: string;
  };
  stages: Record<Stage, string>;
  rarity: Record<BadgeRarity, string>;
  page: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lede: string;
    earnedHeading: string;
    lockedHeading: string;
    earnedCount: (earned: number, total: number) => string;
    criteria: string;
    earnedOn: (date: string) => string;
    evidence: (count: number) => string;
    seasonal: (name: string) => string;
    seasonsEarned: string;
    none: string;
    rules: string;
    shareCard: string;
    shareCardHint: string;
    copyCard: string;
    copied: string;
    plateLabel: (numeral: string) => string;
  };
  killBoard: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lede: string;
    consent: string;
    empty: string;
    emptyCta: string;
    anonymous: string;
    ideaSlayer: string;
    project: (name: string) => string;
    visibility: Record<"community" | "public", string>;
    shareCta: string;
  };
};

export const badgesCopy: Record<PageLocale, BadgesCopy> = {
  en: {
    shell: {
      navLabel: "Builder League progression",
      nav: {
        badges: "Badges",
        missions: "Missions",
        seasons: "Seasons",
        rewards: "Rewards",
        shipRelay: "Ship Relay",
        killBoard: "Kill Board",
        timeCapsule: "Time Capsule",
      },
      signInTitle: "Sign in to see your progress",
      signInBody: "Badges, missions and seasons are tied to your verified Builder League history.",
      signInCta: "Sign in",
      membershipTitle: "Builder League is for members",
      membershipBody: "Join the community to record verified progress, earn badges and take part in seasons.",
      membershipCta: "See membership",
      pilotNote: "Pilot preview: only admins and pilot members can see this page.",
    },
    stages: { validate: "Validate", build: "Build", ship: "Ship", contribute: "Contribute" },
    rarity: { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" },
    page: {
      metaTitle: "Badges · Builder League",
      metaDescription: "Badges for verified progress: validated problems, shipped products, first customers and help given.",
      eyebrow: "Plate I · Badges",
      title: "Badges for progress someone checked",
      lede: "Each badge is earned from verified evidence. Paying, logging in or posting more never earns one.",
      earnedHeading: "Earned",
      lockedHeading: "Still ahead",
      earnedCount: (earned, total) => `${earned} of ${total} badges earned`,
      criteria: "How to earn it",
      earnedOn: (date) => `Earned ${date}`,
      evidence: (count) => `Backed by ${count} verified ${count === 1 ? "event" : "events"}`,
      seasonal: (name) => `Seasonal variant: ${name}`,
      seasonsEarned: "Seasons",
      none: "No badges yet. Your first verified step earns the first one.",
      rules: "Badges are awarded automatically once a moderator or the system verifies the evidence. A moderator can revoke a badge with a reason if the evidence does not hold up.",
      shareCard: "Share card",
      shareCardHint: "A card with the badge name, plate and date. Your evidence stays private.",
      copyCard: "Copy card text",
      copied: "Copied",
      plateLabel: (numeral) => `Plate ${numeral}`,
    },
    killBoard: {
      metaTitle: "Kill Board · Builder League",
      metaDescription: "Ideas members stopped or pivoted because of evidence, and what they learned.",
      eyebrow: "Plate VI · Kill Board",
      title: "Ideas we stopped, and why",
      lede: "Stopping an idea early on real evidence is progress. These are learnings members chose to share.",
      consent: "Only stop or pivot decisions a moderator verified and the member shared appear here. Names show only for members with a public passport; amounts, links and contacts are removed.",
      empty: "No shared learnings yet.",
      emptyCta: "Share a stop or pivot",
      anonymous: "Anonymous builder",
      ideaSlayer: "Idea Slayer",
      project: (name) => `Project: ${name}`,
      visibility: { community: "Members only", public: "Public" },
      shareCta: "Record a stop or pivot",
    },
  },
  vi: {
    shell: {
      navLabel: "Tiến trình Builder League",
      nav: {
        badges: "Huy hiệu",
        missions: "Nhiệm vụ",
        seasons: "Mùa giải",
        rewards: "Phần thưởng",
        shipRelay: "Ship Relay",
        killBoard: "Kill Board",
        timeCapsule: "Hộp thời gian",
      },
      signInTitle: "Đăng nhập để xem tiến trình của bạn",
      signInBody: "Huy hiệu, nhiệm vụ và mùa giải dựa trên lịch sử đã xác minh của bạn trong Builder League.",
      signInCta: "Đăng nhập",
      membershipTitle: "Builder League dành cho thành viên",
      membershipBody: "Tham gia cộng đồng để ghi nhận tiến độ đã xác minh, nhận huy hiệu và tham gia các mùa giải.",
      membershipCta: "Xem gói thành viên",
      pilotNote: "Bản thí điểm: chỉ admin và thành viên thí điểm thấy trang này.",
    },
    stages: { validate: "Kiểm chứng", build: "Xây dựng", ship: "Ra mắt", contribute: "Đóng góp" },
    rarity: { common: "Phổ biến", uncommon: "Ít gặp", rare: "Hiếm", legendary: "Huyền thoại" },
    page: {
      metaTitle: "Huy hiệu · Builder League",
      metaDescription: "Huy hiệu cho tiến độ đã xác minh: vấn đề được kiểm chứng, sản phẩm đã ra mắt, khách hàng đầu tiên và sự giúp đỡ.",
      eyebrow: "Bản I · Huy hiệu",
      title: "Huy hiệu cho tiến độ đã được kiểm tra",
      lede: "Mỗi huy hiệu đến từ bằng chứng đã xác minh. Trả tiền, đăng nhập hay đăng bài nhiều hơn không mang lại huy hiệu nào.",
      earnedHeading: "Đã đạt",
      lockedHeading: "Phía trước",
      earnedCount: (earned, total) => `Đã đạt ${earned}/${total} huy hiệu`,
      criteria: "Cách đạt được",
      earnedOn: (date) => `Đạt ngày ${date}`,
      evidence: (count) => `Dựa trên ${count} sự kiện đã xác minh`,
      seasonal: (name) => `Phiên bản theo mùa: ${name}`,
      seasonsEarned: "Các mùa",
      none: "Bạn chưa có huy hiệu nào. Bước đầu tiên được xác minh sẽ mang về huy hiệu đầu tiên.",
      rules: "Huy hiệu được trao tự động khi moderator hoặc hệ thống xác minh bằng chứng. Moderator có thể thu hồi huy hiệu, kèm lý do, nếu bằng chứng không đứng vững.",
      shareCard: "Thẻ chia sẻ",
      shareCardHint: "Thẻ gồm tên huy hiệu, số bản và ngày đạt. Bằng chứng của bạn vẫn riêng tư.",
      copyCard: "Sao chép nội dung thẻ",
      copied: "Đã sao chép",
      plateLabel: (numeral) => `Bản ${numeral}`,
    },
    killBoard: {
      metaTitle: "Kill Board · Builder League",
      metaDescription: "Những ý tưởng thành viên đã dừng hoặc xoay hướng nhờ bằng chứng, và bài học rút ra.",
      eyebrow: "Bản VI · Kill Board",
      title: "Những ý tưởng đã dừng, và vì sao",
      lede: "Dừng sớm một ý tưởng dựa trên bằng chứng thật cũng là tiến bộ. Đây là những bài học thành viên chọn chia sẻ.",
      consent: "Chỉ những quyết định dừng hoặc xoay hướng đã được moderator xác minh và được thành viên chia sẻ mới xuất hiện. Tên chỉ hiện với thành viên công khai hồ sơ; số tiền, đường dẫn và thông tin liên hệ được ẩn.",
      empty: "Chưa có bài học nào được chia sẻ.",
      emptyCta: "Chia sẻ một lần dừng hoặc xoay hướng",
      anonymous: "Builder ẩn danh",
      ideaSlayer: "Kẻ diệt ý tưởng",
      project: (name) => `Dự án: ${name}`,
      visibility: { community: "Chỉ thành viên", public: "Công khai" },
      shareCta: "Ghi lại một lần dừng hoặc xoay hướng",
    },
  },
};

export function getBadgesCopy(locale: string): BadgesCopy {
  return badgesCopy[toPageLocale(locale)];
}
